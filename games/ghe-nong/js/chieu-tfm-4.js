/* chieu-tfm-4.js — chiêu viết tay đúng mô tả cho nhóm tướng số 4 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   VÍ DỤ MẪU (agent lõi viết, KHÔNG ĐỤNG): Priest — hồi / khiên / kênh chiêu cuối, có `mota` viết tay.

   16 tướng của agent này: poison_dart_hunter, pythoness, shadowmancer, shield_bearer, siege_breaker,
   soldier, spirit_caller, swordman, taoist, vampire, voodoo_shaman, werewolf, whip_master, white_mage,
   wind_mage (đủ, cộng priest đã có sẵn = không đụng).

   Ghi chú chung về diễn giải (mỗi chỗ còn lặp lại ở đúng tướng liên quan):
   - `poison_dart_hunter` và `soldier`: dữ liệu TFM2 gốc đặt tên trường tham số của chiêu ĐẦU là
     "skill1" (không phải "skill") — `data-tuong.js` đọc `c['skill']` nên `S.p` của khe "skill" RỖNG với
     hai tướng này. Đọc thẳng `S.n.tuong.tfm.skill1` (bản gốc TFM2, không qua alias) để lấy số thật.
   - Vài chiêu không có nguyên thuỷ đúng nghĩa trong `S` (chuyển sát thương sang người khác, cấm mục
     TIÊU bị chỉ định, đếm số lần bị đánh trúng, đếm số lần đồng minh ra đòn...) — xấp xỉ bằng nguyên
     thuỷ gần nhất, ghi rõ diễn giải ngay tại chỗ, và xin nguyên thuỷ mới trong kế hoạch (mục "Yêu cầu
     giữa các agent") khi thấy đáng làm ở bước sau.
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  /* ── phụ trợ dùng chung trong tệp này (không đọc ruột sim.js — chỉ lượng giác công khai) ── */
  /** có nằm trong nón `doRong` độ, tính từ hướng `huong` (rad, [cos,sin]) hay không */
  function trongNonH(n, m, huong, doRong) {
    var g = Math.atan2(m.y - n.y, m.x - n.x), hg = Math.atan2(huong[1], huong[0]);
    var d = Math.abs(((g - hg + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return d <= doRong * Math.PI / 180 + 0.05;
  }
  /** địch gần (cx,cy) nhất trong bán kính r (đơn vị TFM2), loại trừ `excl` */
  function ganNhatTai(S, cx, cy, r, excl) {
    var g = null, gd = 1e9;
    S.dich(cx, cy, r, { tuong: true }).forEach(function (m) {
      if (m === excl) return;
      var d = Math.hypot(m.x - cx, m.y - cy);
      if (d < gd) { gd = d; g = m; }
    });
    return g;
  }

  /* ══════════════════ poison_dart_hunter — Bãi Độc Suy Nhược / Truy Vết Độc Tố / Tẩm Độc Vũ Khí ══════════════════ */
  G.CHIEU_TFM.poison_dart_hunter = {
    skill: function (S) {
      /* khoá tham số thật của TFM2 là "skill1", data-tuong.js chỉ đọc "skill" → S.p rỗng, đọc thẳng gốc */
      var p = S.n.tuong.tfm.skill1;
      if (!p) return false;
      var diem = S.diemMuc();
      var moiLan = S.dmg(p.damage, p.attack_ratio, 'atk');
      /* "rải bãi chất độc": vùng tồn tại attack_tick, mỗi attack_period gây sát thương + làm chậm
         (nhiễm độc poison_duration giây — chậm giữ nguyên poison_duration sau khi trúng, không chỉ trong vùng) */
      S.vung(diem[0], diem[1], p.attack_range, p.attack_tick, p.attack_period, function (V, ds) {
        ds.forEach(function (bi) {
          S.sat(bi, moiLan, 'vl');
          S.cham(bi, p.slow_ratio, p.poison_duration);
        });
      }, { ten: S.kn.ten });
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.attack_range) });
      return true;
    },
    /* skill2 "Truy Vết Độc Tố" là NỘI TẠI thụ động (add_move_speed/skill2_range nằm ở gốc `tfm`, không có
       cooltime/duration/start_timing riêng) — sim không bao giờ gọi khe skill2 cho tướng này
       (`n.tuong.tfm.skill2` không tồn tại, xem sim.js dòng ~1309). Không có móc "khi đánh trúng địch nhiễm
       độc" / "khi rời xa địch" trong S để cài nội tại này; để trống, chỉ sửa `mota` cho khỏi hiện dấu `?`. */
    ult: function (S) {
      var p = S.p;
      var minh = S.dongMinh(S.n.x, S.n.y, p.range, { keMinh: true });
      var soLan = Math.max(1, Math.floor(p.buff_duration / p.poison_tick));
      var moiLan = S.dmg(p.damage, p.attack_ratio, 'atk');
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      /* "tẩm độc vũ khí": không có móc "khi đồng minh đánh trúng" trong S — xấp xỉ bằng cách mỗi poison_tick
         gây sát thương độc lên đối thủ mà đồng minh đó VỪA đánh trúng gần đây (đọc trường công khai
         danhTuongAi/danhTuongLuc của sim, giống cách nightmare/priest mẫu đọc thẳng trường thực thể). */
      S.lap(soLan, p.poison_tick, function () {
        minh.forEach(function (a) {
          if (a.chet > 0) return;
          if (S.tran.t - a.danhTuongLuc > S.giay(p.poison_tick)) return;
          var bi = S.tran.nguoi[a.danhTuongAi];
          if (!bi || bi.doi === a.doi || bi.hp <= 0 || bi.chet > 0) return;
          S.sat(bi, moiLan, 'vl');
        });
      });
      return true;
    },
    mota: {
      skill: 'Poison Dart Hunter rải bãi chất độc, gây Sát thương Vật lý bằng 2 + 7% SMCK lên kẻ địch trong phạm vi, khiến chúng bị nhiễm độc trong 3 giây và bị Làm Chậm 10%.',
      skill2: 'Poison Dart Hunter được tăng 60 Tầm Đánh khi tấn công kẻ địch bị nhiễm độc, và được tăng 200% Tốc Độ Di Chuyển khi di chuyển ra xa khỏi chúng. (Nội tại luôn bật — TFM2 không ghi tham số hồi chiêu cho hiệu ứng này nên đây không phải một chiêu chủ động.)',
      ult: 'Poison Dart Hunter tẩm độc cho đòn đánh của các đồng minh xung quanh trong 6 giây. Hiệu ứng độc này liên tục gây Sát thương Vật lý bằng 8 + 10% SMCK trong 3 giây.'
    }
  };

  /* ══════════════════ pythoness — Lời Nguyện Chữa Lành / Lời Nguyện Trừ Tà / Triệu Hồi Quỷ Môn Quan ══════════════════ */
  G.CHIEU_TFM.pythoness = {
    skill: function (S) {
      var p = S.p, m = S.dongMinhYeuNhat(p.range, true);
      if (!m) return false;
      var luong = S.dmg(p.heal, p.attack_ratio, 'ap');
      S.dan(m, m.x, m.y, p.speed, function (bi) { S.hoi(bi, luong); }, { hinh: 'ho' });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y, hoi: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = S.dongMinhYeuNhat(p.range, true) || (S.muc && S.muc.doi === S.n.doi && S.muc.tuong ? S.muc : null);
      if (!m) return false;
      var luongHoi = S.dmg(p.heal, p.heal_ratio, 'ap');
      var luongSat = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.dan(m, m.x, m.y, p.speed, function (bi) {
        S.hoi(bi, luongHoi);
        S.satVung(bi.x, bi.y, p.attack_range, luongSat, 'pt', {});
      }, { hinh: 'ho' });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y, hoi: true });
      return true;
    },
    ult: function (S) {
      var p = S.p, diem = S.diemMuc();
      var soLan = Math.max(1, p.total_shots || 1);
      var luongHoi = S.dmg(p.heal, p.heal_ratio, 'ap');
      var luongSat = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.fx({ loai: 'cuoi', x: diem[0], y: diem[1], dien: true, r: S.kc(p.range) });
      /* "Quỷ Môn Quan" đứng tại điểm triệu hồi, mỗi `term` tick bắn một viên: ưu tiên hồi đồng minh yếu
         nhất dưới 90% máu trong tầm, không thì bắn địch gần nhất trong tầm */
      S.lap(soLan, p.term, function () {
        if (S.n.chet > 0) return;
        var yeu = null, gp = 0.9;
        S.tran.nguoi.forEach(function (a) {
          if (a.doi !== S.n.doi || a.chet > 0) return;
          if (Math.hypot(a.x - diem[0], a.y - diem[1]) > S.kc(p.range) + S.BK) return;
          var pct = a.hp / a.hpMax; if (pct < gp) { gp = pct; yeu = a; }
        });
        if (yeu) { S.dan(yeu, yeu.x, yeu.y, p.speed, function (bi) { S.hoi(bi, luongHoi); }, { hinh: 'ho' }); return; }
        var ke = ganNhatTai(S, diem[0], diem[1], p.range, null);
        if (ke) S.dan(ke, ke.x, ke.y, p.speed, function (bi) { S.sat(bi, luongSat, 'pt'); }, {});
      });
      return true;
    },
    mota: {
      skill2: 'Pythoness hồi Máu bằng 50 + 60% SMPT cho một đồng minh, đồng thời gây Sát thương Phép bằng 200 + 80% SMPT lên kẻ địch trong phạm vi 32 xung quanh đồng minh đó.',
      ult: 'Pythoness triệu hồi Quỷ Môn Quan. Quỷ Môn Quan liên tục bắn ra các viên đạn vào các mục tiêu trong phạm vi 120 xung quanh nó: đạn hồi Máu bằng 30 + 15% SMPT cho đồng minh, hoặc đạn gây Sát thương Phép bằng 40 + 15% SMPT lên kẻ địch.'
    }
  };

  /* ══════════════════ shadowmancer — Bóng Tối Trỗi Dậy / Hắc Ám Bùng Nổ / Quả Cầu Lưu Đày ══════════════════ */
  G.CHIEU_TFM.shadowmancer = {
    skill: function (S) {
      var p = S.p, diem = S.diemMuc();
      var dam = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.attack_range), cho: S.giay(p.delayed) });
      S.sau(p.delayed, function () {
        S.dich(diem[0], diem[1], p.attack_range, {}).forEach(function (m) {
          S.sat(m, dam, 'pt');
          if (m.tuong) S.troi(m, p.bind_tick);
        });
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, dam = S.dmg(p.attack, p.magic_ratio, 'ap');
      /* "kích nổ cái bóng của kẻ địch đang bị Bất Động": tìm địch đang bị trói (skill của chính chiêu này) trong
         tầm; không có thì đành lấy mục tiêu chọn sẵn lúc ra chiêu (đỡ phí lượt, dù không đúng hẳn mô tả) */
      var alvo = ganNhatTai(S, S.n.x, S.n.y, p.range, null), lech = null;
      var ds = S.dich(S.n.x, S.n.y, p.range, { tuong: true });
      for (var i = 0; i < ds.length; i++) if (ds[i].troi > S.tran.t) { lech = ds[i]; break; }
      alvo = lech || ((S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : alvo);
      if (!alvo) return false;
      S.sat(alvo, dam, 'pt');
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: alvo.x, y2: alvo.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), r = S.kc(p.width) / 2;
      var tx = S.n.x + h[0] * S.kc(p.projectile_range), ty = S.n.y + h[1] * S.kc(p.projectile_range);
      var dam = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.dan(null, tx, ty, p.speed, function (m) {
        S.sat(m, dam, 'pt');
        /* "Trục Xuất": không có nguyên thuỷ riêng cho hiệu ứng loại khỏi giao tranh — xấp xỉ bằng khống chế
           toàn phần (choáng) cùng thời lượng banish_duration */
        if (m.tuong) S.choang(m, p.banish_duration);
      }, { r: r, xuyen: true });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: tx, y2: ty, dan: true });
      return true;
    },
    mota: {
      ult: 'Shadowmancer ném quả cầu bóng tối xuyên thấu theo đường thẳng, gây Sát thương Phép bằng 150 + 100% SMPT lên các kẻ địch trúng chiêu và Trục Xuất chúng trong 3 giây.'
    }
  };

  /* ══════════════════ shield_bearer — Lá Chắn Cộng Hưởng / Lời Thề Hộ Vệ / Thành Đồng Khiêu Khích ══════════════════ */
  G.CHIEU_TFM.shield_bearer = {
    skill: function (S) {
      var p = S.p;
      var m = (S.muc && S.muc.doi === S.n.doi && S.muc.tuong) ? S.muc : S.dongMinhYeuNhat(p.range, false);
      function chanCua(u) { return p.shield + u.hpMax * p.shield_ratio / 100; }
      S.chan(S.n, chanCua(S.n), p.tick);
      if (m && m !== S.n) S.chan(m, chanCua(m), p.tick);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m ? m.x : S.n.x, y2: m ? m.y : S.n.y, chan: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p;
      /* "chuyển X% sát thương đồng minh phải nhận vào bản thân": S không có nguyên thuỷ chuyển sát thương
         sang thực thể khác — quan sát được (số máu mất của đồng minh) tương đương một buff giảm-nhận-sát-
         thương X% trên đồng minh đó (chỉ khác là Shield Bearer không "gánh" thêm sát thương cho riêng mình). */
      S.dongMinh(S.n.x, S.n.y, p.range, { keMinh: true }).forEach(function (m) {
        S.buff(m, { giamNhan: p.damage_share_ratio }, p.tick, S.kn.ten);
      });
      var slowPct = p.slow_ratio + p.slow_defence_ratio * S.cs.giap / 100;
      S.dich(S.n.x, S.n.y, p.range, { tuong: true }).forEach(function (m) { S.cham(m, slowPct, p.slow_duration); });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      var giamNhan = p.damage_reduce + p.damage_reduce_magic_resistance_ratio * S.cs.khang / 100;
      S.buff(S.n, { giamNhan: giamNhan, mienKc: 1 }, p.tick, S.kn.ten);
      S.khoaHanh(p.tick);
      S.dich(S.n.x, S.n.y, p.range, { tuong: true }).forEach(function (m) { S.khieu(m, p.taunt_duration); });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    mota: {
      skill2: 'Shield Bearer chuyển 60% sát thương các đồng minh xung quanh phải nhận vào bản thân, đồng thời Làm Chậm những kẻ địch tấn công đồng minh đi 30% + 5% Giáp. (Duy trì trong 4 giây)',
      ult: 'Khi kích hoạt, Shield Bearer nhận được hiệu ứng Giảm Sát Thương bằng 40% + 10% Kháng Phép và nhận Miễn nhiễm Khống Chế trong 2 giây, đồng thời khiến toàn bộ kẻ địch trong một phạm vi rộng xung quanh bị Khiêu Khích trong 2 giây. Ông không thể di chuyển trong thời gian hiệu lực.'
    }
  };

  /* ══════════════════ siege_breaker — Chuỳ Gai Ngàn Cân / Đập Phá Thành Luỹ / Cơn Thịnh Nộ Huỷ Diệt ══════════════════ */
  G.CHIEU_TFM.siege_breaker = {
    skill: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) m = S.dichGanNhat(p.range, { tuong: true, tru: true });
      if (!m) return false;
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      if (m.laTru) luong *= 1 + p.structure_damage_bonus / 100;
      S.sat(m, luong, 'vl');
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemXa(p.offset);
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dich(diem[0], diem[1], p.attack_range, { tru: true }).forEach(function (m) { S.sat(m, luong, 'vl'); });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: diem[0], y2: diem[1], dien: true, r: S.kc(p.attack_range) });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      S.buff(S.n, { atkM: p.attack_mult, tocdanh: p.attack_speed_mult, tocchay: p.move_speed_mult }, p.buff_duration, S.kn.ten);
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.BK });
      return true;
    },
    mota: {
      skill: 'Siege Breaker đập cây chùy gai xuống mục tiêu, gây Sát thương Vật lý bằng 30 + 120% SMCK. Hắn gây thêm 40% sát thương lên công trình.',
      ult: 'Siege Breaker tăng 30% Sức Mạnh Công Kích, 50% Tốc Độ Đánh, và 30% Tốc Độ Di Chuyển trong 8 giây.'
    }
  };

  /* ══════════════════ soldier — Ngắm Bắn Chính Xác / Điểm Xạ Ba Viên / Phát Bắn Xuyên Phá ══════════════════ */
  G.CHIEU_TFM.soldier = {
    /* TFM2 gốc: số liệu của "Điểm Xạ Ba Viên" (skill2 trong tên/tiếng) nằm ở khoá dữ liệu "skill" (khe
       thật sự có cooltime/duration/start_timing và được sim gọi); "Ngắm Bắn Chính Xác" (tăng tầm đánh mỗi
       cấp) là nội tại không có khe riêng (không có "skill2" trong dữ liệu — sim không bao giờ gọi khe đó,
       xem sim.js dòng ~1309). Cài đúng số ở khe THẬT (skill) = ba phát liên tiếp. */
    skill: function (S) {
      var p = S.p, muc = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!muc) return false;
      var dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.lap(3, p.interval, function () {
        if (S.n.chet > 0 || muc.hp <= 0 || (muc.chet && muc.chet > 0)) return;
        S.dan(muc, muc.x, muc.y, p.speed, function (bi) { S.sat(bi, dam, 'vl'); }, {});
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: muc.x, y2: muc.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), d = S.kc(p.range);
      var tx = S.n.x + h[0] * d, ty = S.n.y + h[1] * d;
      var mul = 1, dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dan(null, tx, ty, p.speed, function (m) {
        S.sat(m, dam * mul, 'vl');
        mul *= Math.max(0, 1 - p.attack_reduce_ratio / 100);
      }, { r: S.kc(p.attack_range), xuyen: true });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: tx, y2: ty, dan: true });
      return true;
    },
    mota: {
      skill: 'Soldier bắn ba viên đạn liên tiếp vào một kẻ địch, gây lượng lớn Sát thương Vật lý (mỗi phát gây sát thương 20 + 60% SMCK). Tầm thi triển kỹ năng tăng tỉ lệ thuận với Tầm Đánh cơ bản.',
      skill2: 'Soldier được tăng 3 Tầm Đánh mỗi cấp. (Nội tại thụ động — TFM2 gộp chung tham số của "Điểm Xạ Ba Viên" và nội tại này vào một mục dữ liệu; ba phát liên tiếp đã cài ở khe "skill" phía trên vì đó là khe sim thật sự gọi. Tăng tầm đánh mỗi cấp KHÔNG cộng vào chỉ số tướng ở đây — việc của bảng chỉ số cốt lõi, đã báo trong kế hoạch.)',
      ult: 'Soldier bắn một viên đạn khổng lồ bay theo đường thẳng nhắm vào kẻ địch trong phạm vi 300. Viên đạn gây Sát thương Vật lý bằng 200 + 150% SMCK lên toàn bộ kẻ địch trên quỹ đạo bay, và lượng sát thương sẽ giảm đi 80% mỗi khi trúng một kẻ địch.'
    }
  };

  /* ══════════════════ spirit_caller — Tinh Linh Hồi Phục / Tinh Linh Suy Yếu / Bùng Nổ Tinh Linh ══════════════════ */
  G.CHIEU_TFM.spirit_caller = {
    skill: function (S) {
      var p = S.p, m = S.dongMinhYeuNhat(p.range, true);
      if (!m) return false;
      var moiLan = S.dmg(p.heal, p.heal_ratio, 'ap');
      S.buff(m, { tocchay: p.speed_up }, p.dot_tick, S.kn.ten);
      var soLan = Math.max(1, Math.floor(p.dot_tick / p.dot_period));
      S.lap(soLan, p.dot_period, function () { if (m.chet <= 0) S.hoi(m, moiLan); });
      /* đánh dấu "có tinh linh" để ult kích nổ được (không có nguyên thuỷ theo dõi buff theo tên trong S) */
      m._tinhLinhSC = S.tran.t + S.giay(p.dot_tick);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y, hoi: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      var giapGiam = p.defense_down + p.defense_down_ap_ratio * S.cs.ap / 100;
      var khangGiam = p.magic_def_down + p.magic_def_down_ap_ratio * S.cs.ap / 100;
      S.buff(m, { giap: -giapGiam, khang: -khangGiam }, p.buff_duration, S.kn.ten);
      S.cham(m, p.speed_down, p.buff_duration);
      m._tinhLinhSCd = S.tran.t + S.giay(p.buff_duration);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, t = S.tran.t;
      var shieldAmt = S.dmg(p.shield_amount, p.shield_ap_ratio, 'ap');
      var dmgAmt = S.dmg(p.damage, p.damage_ap_ratio, 'ap');
      S.tran.nguoi.forEach(function (m) {
        if (m.chet > 0 || Math.hypot(m.x - S.n.x, m.y - S.n.y) > S.kc(p.ult_range) + S.BK) return;
        if (m.doi === S.n.doi && m._tinhLinhSC > t) {
          S.chan(m, shieldAmt, p.shield_duration);
          S.buff(m, { tocdanh: p.attack_speed_boost }, p.buff_duration, S.kn.ten + ':as');
          m._tinhLinhSC = 0;
        } else if (m.doi !== S.n.doi && m._tinhLinhSCd > t) {
          S.sat(m, dmgAmt, 'pt');
          S.choang(m, p.stun_duration);
          m._tinhLinhSCd = 0;
        }
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.ult_range) });
      return true;
    },
    mota: {
      skill: 'Spirit Caller gắn một tinh linh vào đồng minh, giúp hồi Máu bằng 20 + 5% SMPT và tăng 15% Tốc Độ Di Chuyển trong 2 giây.',
      skill2: 'Spirit Caller gắn một tinh linh vào kẻ địch, làm giảm lượng Giáp bằng 30 + 10% SMPT và lượng Kháng Phép bằng 30 + 10% SMPT, đồng thời Làm Chậm 30% trong 3 giây.',
      ult: 'Spirit Caller kích nổ những tinh linh đã gắn lên mục tiêu. Tinh linh trên đồng minh tạo một Lá chắn có giá trị 100 + 30% SMPT và tăng 30% Tốc Độ Đánh. Tinh linh trên kẻ địch gây Sát thương Phép bằng 100 + 30% SMPT và Làm Choáng trong 0.8 giây.'
    }
  };

  /* ══════════════════ swordman — Sóng Kiếm Khí / Tam Liên Trảm / Xung Kích Chớp Nhoáng ══════════════════ */
  G.CHIEU_TFM.swordman = {
    skill: function (S) {
      var p = S.p, h = S.huong(), d = S.kc(p.range);
      var tx = S.n.x + h[0] * d, ty = S.n.y + h[1] * d;
      var dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dan(null, tx, ty, p.speed, function (m) { S.sat(m, dam, 'vl'); }, { r: S.kc(p.attack_range), xuyen: true });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: tx, y2: ty, dan: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      var dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.lap(3, p.interval, function () {
        if (S.n.chet > 0 || m.hp <= 0 || (m.chet && m.chet > 0)) return;
        S.sat(m, dam, 'vl');
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), d = S.kc(p.range), r = S.kc(p.width) / 2;
      var tx = S.n.x + h[0] * d, ty = S.n.y + h[1] * d;
      var dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      var trung = [], haGuc = false;
      /* TFM2 không ghi tốc lao cho ult này (chỉ có range/width) — 6000 là tốc lao/đạn phổ biến nhất trong
         bộ dữ liệu này, chỉ ảnh hưởng nhịp lướt trên màn hình, KHÔNG ảnh hưởng sát thương/tầm/độ rộng
         (đều lấy nguyên từ S.p). */
      S.lao(tx, ty, 6000, null, {
        moiBuoc: function () {
          S.dich(S.n.x, S.n.y, r, {}).forEach(function (m) {
            if (trung.indexOf(m) !== -1) return;
            trung.push(m);
            var truoc = m.hp;
            S.sat(m, dam, 'vl');
            if (m.tuong && truoc > 0 && m.hp <= 0) haGuc = true;
          });
        }
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: tx, y2: ty, dan: true });
      if (haGuc) S.giamHoi('ult', p.cooltime);   /* "hạ gục thì hồi chiêu được đặt lại" — trừ đúng CD vừa mất */
      return true;
    }
  };

  /* ══════════════════ taoist — Phong Ấn Vũ Khí / Phong Ấn Thuật Pháp / Phong Ấn Dây Chuyền ══════════════════ */
  G.CHIEU_TFM.taoist = {
    skill: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt');
      /* "Giải Giới" (cấm đánh thường): không có nguyên thuỷ cấm đánh thường riêng trong S — xấp xỉ bằng dìm
         tốc đánh xuống sàn (chiSoNguoi kẹp tối thiểu 0,2× khi tocdanh ≤ −80%). Xin thêm nguyên thuỷ
         giaiGioi(m,tick) đúng nghĩa nếu cần (đã ghi trong kế hoạch). */
      S.buff(m, { tocdanh: -100 }, p.block_duration, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt');
      S.im(m, p.block_duration);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), d = S.kc(p.range), r = S.kc(p.projectile_radius);
      var dam = S.dmg(p.attack, p.attack_ratio, 'ap');
      function ap(m) {
        if (!m || m.hp <= 0) return;
        S.sat(m, dam, 'pt');
        if (!m.tuong || (m.chet && m.chet > 0)) return;
        S.choang(m, p.seal_duration);
        /* "Không Thể Bị Chỉ Định" áp cho MỤC TIÊU: S.khongChon(tick) chỉ tự áp cho người ra chiêu, không có
           bản nhận `m`. Gán thẳng trường công khai giống hệt việc sim.js làm trong S.khongChon (đọc S.tran.t /
           S.giay, không đụng hàm riêng nào) — xin thêm S.khongChonMuc(m,tick) ở kế hoạch. */
        m.khongChon = Math.max(m.khongChon || 0, S.tran.t + S.giay(p.seal_duration));
        S.sau(p.seal_duration, function () {
          if (m.chet > 0) return;
          S.dich(m.x, m.y, p.spread_range, { tuong: true }).forEach(function (m2) {
            if (m2 === m || m2.hp <= 0 || (m2.chet && m2.chet > 0)) return;
            S.sat(m2, dam, 'pt');
            S.choang(m2, p.seal_duration);
            m2.khongChon = Math.max(m2.khongChon || 0, S.tran.t + S.giay(p.seal_duration));
          });
        });
      }
      S.dan(null, S.n.x + h[0] * d, S.n.y + h[1] * d, p.speed, ap, { r: r });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: S.n.x + h[0] * d, y2: S.n.y + h[1] * d, dan: true });
      return true;
    },
    mota: {
      skill: 'Taoist phong ấn kẻ địch bằng bùa chú, gây Sát thương Phép bằng 20 + 90% SMPT và khiến mục tiêu bị Giải Giới trong 3 (+6% SMPT) giây. Giải Giới khiến kẻ địch không thể đánh thường.',
      skill2: 'Taoist dán bùa lên kẻ địch, gây Sát thương Phép bằng 30 + 80% SMPT và khiến mục tiêu bị Câm Lặng trong 3 (+6% SMPT) giây. Câm Lặng khiến kẻ địch không thể dùng kỹ năng.',
      ult: 'Taoist phóng ra bùa chú theo đường thẳng, gây Sát thương Phép bằng 100 + 100% SMPT lên kẻ địch trúng chiêu, đồng thời làm Bất Động trong 2 giây và khiến mục tiêu Không Thể Bị Chỉ Định. Khi hiệu ứng kết thúc, hiệu ứng tương tự sẽ lan sang các kẻ địch xung quanh.'
    }
  };

  /* ══════════════════ vampire — Truyền Máu / Dòng Máu Phun Trào / Huyết Ảnh Bộ ══════════════════ */
  G.CHIEU_TFM.vampire = {
    skill: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      S.sat(m, S.dmg(p.attack, p.ap_ratio, 'ap'), 'pt');
      S.n._vpStack = (S.n._vpStack || 0) + 1;
      S.hoi(S.n, p.heal + p.heal_per_stack * S.n._vpStack);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    skill2: function (S) {
      var p = S.p;
      /* "tiêu hao X% Máu của bản thân": không có nguyên thuỷ tự trừ máu riêng — dùng S.sat với loại 'thuc'
         (bỏ qua giáp/kháng/lá chắn) lên chính mình, giống công thức satThuong đọc thẳng */
      S.sat(S.n, S.n.hpMax * p.hp_ratio / 100, 'thuc');
      var luong = S.dmg(p.attack, p.ap_ratio, 'ap') + (S.n._vpStack || 0) * p.damage_per_stack;
      S.satVung(S.n.x, S.n.y, p.range, luong, 'pt', { nonNua: 60 });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), d = S.kc(p.range), r = S.kc(p.attack_range) / 2;
      var tx = S.n.x + h[0] * d, ty = S.n.y + h[1] * d;
      var dam = S.dmg(p.attack, p.ap_ratio, 'ap'), hut = S.dmg(p.heal, p.heal_ratio, 'ap');
      S.khongChon(p.duration);
      var trung = [];
      S.lao(tx, ty, p.speed, null, {
        moiBuoc: function () {
          S.dich(S.n.x, S.n.y, r, {}).forEach(function (m) {
            if (trung.indexOf(m) !== -1) return;
            trung.push(m);
            S.sat(m, dam, 'pt');
            S.hoi(S.n, hut);
          });
        }
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: tx, y2: ty, dan: true });
      return true;
    },
    mota: {
      skill: 'Vampire hút máu kẻ địch, gây Sát thương Phép bằng 50 + 100% SMPT, đồng thời hồi 60 Máu và tích lũy điểm cộng dồn. Mỗi điểm cộng dồn tăng lượng Máu hồi phục thêm 3.',
      skill2: 'Vampire tiêu hao 4% Máu của bản thân để phun máu ra theo hình nón phía trước, gây Sát thương Phép bằng 50 + 100% SMPT. Mỗi điểm cộng dồn tăng lượng sát thương thêm 3.',
      ult: 'Vampire trở nên Không Thể Bị Chỉ Định và lướt một khoảng cách 120, hút Máu bằng 300 + 80% SMPT từ mỗi kẻ địch trên đường lướt, đồng thời gây Sát thương Phép bằng 200 + 80% SMPT.'
    }
  };

  /* ══════════════════ voodoo_shaman — Mũi Tên Nguyền Rủa / Lời Nguyền Đau Đớn / Lãnh Địa Tà Thuật ══════════════════ */
  G.CHIEU_TFM.voodoo_shaman = {
    skill: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      var dam = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.dan(m, m.x, m.y, p.speed, function (bi) {
        S.sat(bi, dam, 'pt');
        S.cham(bi, p.slow_ratio, p.slow_duration);
        S.buff(bi, { tocdanh: -p.attack_speed_reduce }, p.attack_speed_reduce_duration, S.kn.ten);
      }, { r: S.kc(p.attack_range) });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y, dan: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      S.sat(m, S.dmg(p.base_damage, p.damage_ratio, 'ap'), 'pt');
      var moi = S.dmg(p.per_hit_damage, p.per_hit_ratio, 'ap');
      var khoang = Math.max(1, Math.floor(p.curse_duration / p.max_hits));
      /* mô tả gốc tính theo SỐ LẦN mục tiêu bị đánh trúng trong lúc nguyền — S không có móc "khi bị đánh
         trúng"; xấp xỉ bằng nhịp đều đặn tối đa max_hits lần trải trong curse_duration */
      S.lap(p.max_hits, khoang, function () { if (m.hp > 0 && !(m.chet > 0)) S.sat(m, moi, 'pt'); });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, diem = S.diemMuc();
      S.vung(diem[0], diem[1], p.range, p.ult_duration, p.period, function (V, ds) {
        ds.forEach(function (m) {
          var luong = m.hpMax * p.max_hp_damage_ratio / 100 + p.magic_ratio / 100 * S.cs.ap;
          S.sat(m, luong, 'pt');
          if (m.tuong) S.im(m, p.block_skill_tick);
        });
      }, { ten: S.kn.ten });
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.range) });
      return true;
    },
    mota: {
      skill: 'Voodoo Shaman bắn một mũi tên nguyền rủa, gây Sát thương Phép bằng 120 + 100% SMPT, Làm Chậm 60% trong 0.4 giây đồng thời giảm 40% Tốc Độ Đánh trong 2 giây.',
      skill2: 'Voodoo Shaman nguyền rủa mục tiêu chỉ định trong 5 giây và gây Sát thương Phép bằng 40 + 60% SMPT. Trong thời gian duy trì, gây thêm sát thương tương ứng với số lần mục tiêu bị tấn công bằng 10 + 5% SMPT (tối đa 20 lần).',
      ult: 'Voodoo Shaman tạo một vùng tà thuật tại vị trí chỉ định trong 5 giây. Kẻ địch trong vùng sẽ liên tục chịu Sát thương Phép bằng 4% Máu Tối đa + 30% SMPT và bị Câm Lặng. Câm Lặng khiến kẻ địch không thể dùng kỹ năng.'
    }
  };

  /* ══════════════════ werewolf — Móng Vuốt Dã Thú / Mãnh Thú Đột Kích / Cào Xé Điên Cuồng ══════════════════ */
  G.CHIEU_TFM.werewolf = {
    skill: function (S) {
      var p = S.p, diem = S.diemXa(p.offset), h = S.huong();
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk'), tong = 0;
      S.dich(diem[0], diem[1], p.attack_range, {}).forEach(function (m) {
        if (!trongNonH(S.n, m, h, 60)) return;
        tong += S.sat(m, luong, 'vl');
      });
      if (tong) S.hoi(S.n, tong * p.heal_ratio / 100);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: diem[0], y2: diem[1], dien: true, r: S.kc(p.attack_range) });
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      var dx = diem[0] - S.n.x, dy = diem[1] - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range));
      var dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      var trung = [];
      /* pull_speed/pull_time của TFM2 không xuất hiện trong mô tả chính thức — không rõ vai trò, để trống */
      S.lao(S.n.x + dx / d * xa, S.n.y + dy / d * xa, p.speed, null, {
        moiBuoc: function () {
          S.dich(S.n.x, S.n.y, S.kc(p.attack_range), {}).forEach(function (m) {
            if (trung.indexOf(m) !== -1) return;
            trung.push(m);
            S.sat(m, dam, 'vl');
            S.cham(m, p.slow_speed, p.slow_duration);
          });
        }
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: diem[0], y2: diem[1], dan: true });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong();
      var dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      var docRate = S.dmg(p.bleed, p.bleed_ratio, 'atk') * S.TPS / p.bleed_tick;
      var soLan = Math.max(1, Math.floor(p.channel_duration / p.period));
      S.khoaHanh(p.channel_duration);
      S.lap(soLan, p.period, function () {
        if (S.n.chet > 0) return;
        S.dich(S.n.x, S.n.y, p.range, {}).forEach(function (m) {
          if (!trongNonH(S.n, m, h, p.half_angle_deg)) return;
          S.sat(m, dam, 'vl');
          S.doc(m, docRate, p.bleed_duration, 'vl', S.kn.ten);
        });
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    }
  };

  /* ══════════════════ whip_master — Quất Roi / Quét Roi / Vũ Điệu Cuồng Thát ══════════════════ */
  G.CHIEU_TFM.whip_master = {
    skill: function (S) {
      var p = S.p, m = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      var luong = S.dmg(p.attack, p.attack_ratio, 'atk') + m.hp * p.target_hp_ratio / 100;
      S.sat(m, luong, 'vl');
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    skill2: function (S) {
      var p = S.p, luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      var trung = S.satVung(S.n.x, S.n.y, p.range, luong, 'vl', { nonNua: 60 });
      trung.forEach(function (m) { if (m.tuong || m.hienRa) S.day(m, p.knockback_speed, p.knockback_tick); });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      var soLan = Math.max(1, Math.floor(p.channel_duration / p.period));
      var dam = S.dmg(p.attack, p.attack_ratio, 'atk');
      var docRate = S.dmg(p.bleed, p.bleed_ratio, 'atk') * S.TPS / p.bleed_tick;
      S.khoaHanh(p.channel_duration);
      S.lap(soLan, p.period, function () {
        if (S.n.chet > 0) return;
        var ds = S.dich(S.n.x, S.n.y, p.range, { tuong: true });
        if (!ds.length) return;
        var m = S.tran.rng.chon(ds);
        var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var tx = S.n.x + dx / d * S.kc(p.projectile_range), ty = S.n.y + dy / d * S.kc(p.projectile_range);
        /* TFM2 không ghi tốc đạn riêng cho chiêu này (chỉ có projectile_range/width) — 9000 chỉ ảnh hưởng
           nhịp bay trên màn hình, không ảnh hưởng sát thương/tầm/độ rộng */
        S.dan(null, tx, ty, 9000, function (bi) {
          S.sat(bi, dam, 'vl');
          S.doc(bi, docRate, p.bleed_duration, 'vl', S.kn.ten);
        }, { r: S.kc(p.projectile_width) / 2, xuyen: true });
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    mota: {
      skill: 'Whip Master quất cây roi vào kẻ địch, gây Sát thương Vật lý bằng 60 + 100% SMCK cộng sát thương tương đương 5% Máu của mục tiêu.'
    }
  };

  /* ══════════════════ white_mage — Tia Sáng Chói Loà / Quang Chiếu Thánh Vực / Vòng Phong Ấn ══════════════════ */
  G.CHIEU_TFM.white_mage = {
    skill: function (S) {
      var p = S.p, diem = S.diemMuc();
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.attack_range), cho: S.giay(p.delayed) });
      S.sau(p.delayed, function () {
        S.dich(diem[0], diem[1], p.attack_range, {}).forEach(function (m) { S.sat(m, luong, 'pt'); });
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      var luong = S.dmg(p.damage, p.attack_ratio, 'ap');
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.attack_range), cho: S.giay(p.first_delay) });
      S.sau(p.first_delay, function () {
        /* mô tả gốc ghi cố định "tấn công 5 lần" dù attack_tick/attack_period lẻ ra ~7 nhịp — theo đúng số
           chính thức trong chữ tiếng Việt */
        S.lap(5, p.attack_period, function () {
          if (S.n.chet > 0) return;
          S.dich(diem[0], diem[1], p.attack_range, {}).forEach(function (m) {
            S.sat(m, luong, 'pt');
            S.cham(m, p.slow, p.slow_duration);
          });
        });
      });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), d = S.kc(p.range);
      var tx = S.n.x + h[0] * d, ty = S.n.y + h[1] * d;
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.dan(null, tx, ty, p.speed, function (m) {
        S.sat(m, luong, 'pt');
        if (m.tuong) S.troi(m, p.bind_duration);
      }, { r: S.kc(p.attack_range), xuyen: true });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: tx, y2: ty, dan: true });
      return true;
    }
  };

  /* ══════════════════ wind_mage — Cuồng Phong / Gió Lốc / Lốc Xoáy Truy Đuổi ══════════════════ */
  G.CHIEU_TFM.wind_mage = {
    skill: function (S) {
      var p = S.p, diem = S.diemMuc();
      var moiLan = S.dmg(p.damage, p.attack_ratio, 'ap');
      S.vung(diem[0], diem[1], p.attack_range, p.attack_tick, p.attack_period, function (V, ds) {
        ds.forEach(function (m) { S.sat(m, moiLan, 'pt'); });
      }, {
        hoi: function (V, dsMinh) { dsMinh.forEach(function (m) { S.buff(m, { tocchay: p.move_speed }, p.attack_period + 6, S.kn.ten); }); },
        ten: S.kn.ten
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, h = S.huong(), goc = Math.atan2(h[1], h[0]);
      var dam = S.dmg(p.attack, p.attack_ratio, 'ap'), d = S.kc(p.range);
      /* "năm lốc xoáy về phía trước": không có góc quạt trong dữ liệu — 10° giữa hai tia liền kề chỉ là lựa
         chọn hình ảnh, không ảnh hưởng sát thương/tầm/bán kính (đều lấy từ S.p) */
      for (var i = 0; i < 5; i++) {
        var gg = goc + (i - 2) * (10 * Math.PI / 180);
        var tx = S.n.x + Math.cos(gg) * d, ty = S.n.y + Math.sin(gg) * d;
        S.dan(null, tx, ty, p.speed, function (m) { S.sat(m, dam, 'pt'); }, { r: S.kc(p.attack_range), xuyen: true });
      }
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: S.n.x + h[0] * d, y2: S.n.y + h[1] * d, dan: true });
      return true;
    },
    ult: function (S) {
      var p = S.p, batDau = S.tran.t;
      function ban(muc, r, dam, airT) {
        if (!muc || S.tran.t - batDau > S.giay(p.projectile_tick)) return;
        S.dan(muc, muc.x, muc.y, p.speed, function (bi) {
          S.sat(bi, dam, 'pt');
          if (bi.tuong) S.hat(bi, airT);
          var rMoi = Math.max(0, r - S.kc(p.shrink_per_hit));
          if (rMoi < S.kc(p.min_radius)) return;
          var ke2 = ganNhatTai(S, bi.x, bi.y, p.range, bi);
          if (ke2) ban(ke2, rMoi, dam * (1 - p.damage_decay / 100), Math.max(0, airT - p.airborne_decay));
        }, { r: r });
      }
      var dauTien = (S.muc && S.muc.tuong && S.muc.doi !== S.n.doi) ? S.muc : ganNhatTai(S, S.n.x, S.n.y, p.range, null);
      if (!dauTien) return false;
      ban(dauTien, S.kc(p.radius), S.dmg(p.attack, p.attack_ratio, 'ap'), p.airborne_tick);
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: dauTien.x, y2: dauTien.y, dan: true });
      return true;
    },
    mota: {
      ult: 'Wind Mage bắn một cơn lốc xoáy khổng lồ di chuyển chậm về phía tướng địch gần nhất. Kẻ địch trúng lốc xoáy chịu Sát thương Phép bằng 150 + 60% SMPT và bị Hất Tung trong 0.7 giây. Mỗi lần trúng đích, kích thước, sát thương và thời gian hất tung của cơn lốc xoáy sẽ giảm đi, đồng thời đổi hướng bay về phía một tướng địch khác.'
    }
  };

})(window);
