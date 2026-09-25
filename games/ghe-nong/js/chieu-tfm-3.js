/* chieu-tfm-3.js — chiêu viết tay đúng mô tả cho nhóm tướng số 3 (bước 4, một agent một tệp).

   Mỗi tướng là một mục G.CHIEU_TFM['<id TFM2>'] = { skill: fn(S), skill2: fn(S), ult: fn(S), mota: {...} }.
   Hàm trả `false` thì sim chạy cách chung theo tham số (chieu.js). Bộ hàm nguyên thuỷ `S` và
   luật viết ở RESEARCH.md §14.3. Chưa viết con nào thì sim vẫn không thiếu gì.

   VÍ DỤ MẪU (agent lõi viết, ĐÃ CÓ SẴN — không sửa): Nightmare (tướng mod) — ult thay nút Native
   bằng lao tới mục tiêu, hạ gục thì dịch chuyển tới cạnh đồng minh gần nhất còn sống.

   NHÓM AGENT NÀY (bước 4, agent 3) PHỤ TRÁCH:
   - 10 tướng gốc, đủ 3 chiêu: illusionist, inquisitor, jiangshi, knight, lancer, lightning_mage,
     magic_knight, monk, necromancer, ninja.
   - 12 nút Native còn lại của 5 tướng mod (không đụng cây hiệu ứng, chỉ thay đúng nút Native):
     crossbowman (skill, skill2, ult), strongman (skill, ult), spellbreaker (ult),
     astrologer (skill, skill2, ult), harpooner (skill, skill2, ult).

   BẪY DỮ LIỆU ĐÃ VÁ (lõi, giữa lúc agent này đang viết) — `champion_info.champion_info_sheet` đặt
   tên khoá chiêu-đầu không đều giữa các tướng gốc (phần lớn "skill", nhưng jiangshi/lightning_mage
   dùng "skill1"); build_tfm_data.py giờ nắn khoá này, ghi lại vào `tfm.khoa_goc`. jiangshi vốn có
   CẢ "skill" lẫn "skill1" (skill1 = triệu hồi "Quân Đoàn Cương Thi", skill = choáng+hồi
   "Cú Đánh Trời Giáng") — lõi đã đẩy đúng: `S.p` của `skill` giờ là triệu hồi, `skill2` là
   choáng+hồi. lightning_mage: `skill` giờ đúng là "Giật Sét Liên Hoàn". monk: chiêu đầu gốc tên
   "heal_skill" (Hào Quang Hồi Phục), cũng đã nắn sang `skill`.
*/
(function (G) {
  'use strict';
  G.CHIEU_TFM = G.CHIEU_TFM || {};

  /* ---------- trợ giúp dùng chung trong tệp này ---------- */

  /** đồng minh gần nhất trong bán kính r (đơn vị TFM2); boSelf=true thì không tính chính mình */
  function dmGanNhat(S, r, boSelf) {
    var gd = 1e9, muc = null;
    S.tran.nguoi.forEach(function (a) {
      if (a.doi !== S.n.doi || a.chet > 0) return;
      if (boSelf && a === S.n) return;
      var d = Math.hypot(a.x - S.n.x, a.y - S.n.y);
      if (d <= S.kc(r) && d < gd) { gd = d; muc = a; }
    });
    return muc;
  }

  function xoayVecto(h, doGoc) {
    var r = doGoc * Math.PI / 180;
    return [h[0] * Math.cos(r) - h[1] * Math.sin(r), h[0] * Math.sin(r) + h[1] * Math.cos(r)];
  }

  /* ══════════════════════════ 10 TƯỚNG GỐC ══════════════════════════ */

  /* ---------- illusionist ---------- */
  G.CHIEU_TFM.illusionist = {
    skill: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      S.dan(m, m.x, m.y, p.speed, function (bi) {
        if (bi.chet > 0) return;
        S.sat(bi, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt');
        /* "triệu hồi một phân thân trước mặt mục tiêu để Khiêu Khích" — sim không có thực thể mồi
           nhử riêng; xấp xỉ bằng cách khiêu khích thẳng mục tiêu (buộc đánh Illusionist), coi như
           mục tiêu sập bẫy phân thân. [ĐỀ XUẤT] */
        if (bi.tuong) S.khieu(bi, p.taunt_duration);
        S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: bi.x, y2: bi.y });
      }, {});
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      var luong = S.dmg(p.attack, p.magic_ratio, 'ap');
      S.dich(diem[0], diem[1], p.range, { tuong: true }).forEach(function (bi) {
        S.sat(bi, luong, 'pt');
        S.so(bi, p.fear_tick);
      });
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.range) });
      return true;
    },
    ult: function (S) {
      var p = S.p, ban = dmGanNhat(S, p.range, true);
      if (!ban) return false;
      var tfm = ban.tuong.tfm, st = {}, k;
      for (k in tfm.stat) st[k] = tfm.stat[k] + (tfm.growth[k] || 0) * ((ban.cap || 1) - 1);
      S.trieuHoi({ stat: st, danh: tfm.attack, lau: S.giay(p.illusion_duration), ten: S.kn.ten });
      S.chu(S.n, 'phân thân');
      return true;
    },
    mota: {
      skill2: 'Illusionist kích nổ ảo ảnh tại điểm ngắm, gây Sát thương Phép bằng 120 + 100% SMPT lên kẻ địch trong phạm vi 60 xung quanh và làm Hoảng Sợ trong 1 giây.',
      ult: 'Illusionist tạo một phân thân của một đồng minh gần nhất trong phạm vi 80, tồn tại trong 10 giây. Phân thân chỉ có thể đánh thường, chỉ số bằng Tướng được sao chép tại thời điểm triệu hồi.'
    }
  };

  /* ---------- inquisitor ---------- */
  G.CHIEU_TFM.inquisitor = {
    skill: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var da = false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range));
      S.lao(S.n.x + dx / d * xa, S.n.y + dy / d * xa, p.speed, null, {
        moiBuoc: function () {
          if (da) return;
          S.dich(S.n.x, S.n.y, p.attack_range, { tuong: true }).forEach(function (bi) {
            if (da) return;
            da = true;
            S.sat(bi, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
            var moiGiay = S.dmg(0, p.bleed_ratio, 'atk') * S.TPS / p.bleed_tick;
            S.doc(bi, moiGiay, p.bleed_duration, 'vl', 'chảy máu');
            bi._inqChayMauToi = S.t + S.giay(p.bleed_duration);      /* dấu để skill2 biết đang chảy máu */
            S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: bi.x, y2: bi.y });
          });
        }
      });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      if (m._inqChayMauToi && m._inqChayMauToi > S.t) S.giamHoi('skill', 99999);   /* làm mới hồi chiêu skill */
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range)), dung = Math.max(0, xa - S.BK * 2);
      var diX = S.n.x + dx / d * dung, diY = S.n.y + dy / d * dung;
      S.lao(diX, diY, p.speed, function () {
        var giet = false;
        S.dich(diX, diY, p.area_range, { tuong: true }).forEach(function (bi) {
          if (bi.chet > 0) return;
          var truoc = bi.hp;
          S.sat(bi, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
          if (bi.chet <= 0 && bi.hp > 0 && bi.hp <= bi.hpMax * p.execute_threshold / 100) { S.sat(bi, bi.hp + 1, 'thuc'); giet = true; }
          else if (truoc > 0 && bi.chet > 0) giet = true;
        });
        if (giet) {
          S.dich(diX, diY, p.fear_range, { tuong: true }).forEach(function (bi) { S.so(bi, p.fear_duration); });
        }
        S.fx({ loai: 'cuoi', x: diX, y: diY, dien: true, r: S.kc(p.area_range) });
      });
      return true;
    },
    mota: {
      ult: 'Inquisitor lướt tới một kẻ địch trong tầm 60, gây Sát thương Vật lý 150 + 100% SMCK lên toàn bộ kẻ địch quanh điểm đến (bán kính 25). Kẻ địch còn dưới 15% Máu Tối Đa sau đòn này bị kết liễu; nếu kết liễu thành công, các kẻ địch quanh đó bị Hoảng Sợ trong 1 giây (bán kính 30).'
    }
  };

  /* ---------- jiangshi ---------- */
  G.CHIEU_TFM.jiangshi = {
    skill: function (S) {
      var p = S.p;
      var st = {}, k; for (k in p.stat) st[k] = p.stat[k];
      /* "biến mất sau 3 đòn đánh" — sim không đếm được đòn của quân triệu hồi, xấp xỉ bằng thời
         lượng cố định small_jiangshi_duration (4 giây). [ĐỀ XUẤT] */
      S.trieuHoi({ stat: st, danh: p.attack, lau: S.giay(p.small_jiangshi_duration), ten: 'Cương Thi Con' });
      return true;
    },
    skill2: function (S) {
      var p = S.p;
      var m = (S.muc && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
      S.choang(m, p.stun);
      S.hoi(S.n, p.heal);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      var damage = S.dmg(p.damage, p.attack_ratio, 'ap');
      var heal = S.dmg(p.heal, p.heal_ratio, 'ap');
      S.vung(S.n.x, S.n.y, p.range, p.buff_duration, p.term, function (V, ds) {
        ds.forEach(function (m) { S.sat(m, damage, 'pt'); });
        if (ds.length) S.hoi(S.n, heal);
      }, { ten: S.kn.ten });
      return true;
    },
    mota: {
      skill: 'Jiangshi triệu hồi một Cương Thi Con (110 công, đòn đánh riêng 50% SMCK) lao vào đánh kẻ địch trong tầm 65; Cương Thi Con biến mất sau khoảng 4 giây hoặc 3 đòn đánh.',
      skill2: 'Jiangshi giáng một đòn mạnh xuống kẻ địch gần nhất trong tầm 28, Làm Choáng trong 1 giây, gây Sát thương Vật lý 30 + 100% SMCK và hồi 200 Máu cho bản thân.',
      ult: 'Jiangshi tạo vùng hút sinh lực quanh mình trong 6 giây, mỗi 0.5 giây gây Sát thương Phép 60 + 30% SMPT lên kẻ địch trong phạm vi 48 xung quanh, đồng thời hồi 50 + 30% SMPT Máu cho bản thân mỗi lượt có kẻ địch trúng.'
    }
  };

  /* ---------- knight ---------- */
  G.CHIEU_TFM.knight = {
    skill: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      S.khieu(m, p.tick);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    skill2: function (S) {
      var p = S.p;
      S.chan(S.n, p.shield + S.cs.hpMax * p.shield_ratio / 100, p.tick);
      S.buff(S.n, { phanDon: p.reflect }, p.tick, S.kn.ten);
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: S.n.x, y2: S.n.y, chan: true });
      return true;
    },
    ult: function (S) {
      var p = S.p, diem = S.diemMuc();
      var giam = p.damage_reduce + p.damage_reduce_hp_ratio / 100 * S.cs.hpMax;
      S.vung(diem[0], diem[1], p.range, p.tick, 8, function (V, dsDich) {
        dsDich.forEach(function (m) { if (m.tuong || m.hienRa) S.cham(m, p.move_speed_reduce, 10); });
      }, { hoi: function (V, dsMinh) { dsMinh.forEach(function (m) { S.buff(m, { giamNhan: giam }, 10, S.kn.ten); }); }, ten: S.kn.ten });
      S.fx({ loai: 'cuoi', x: diem[0], y: diem[1], dien: true, r: S.kc(p.range) });
      return true;
    },
    mota: {
      ult: 'Knight tạo vùng bảo vệ bán kính 60 tại vị trí chỉ định (tầm đặt 80), tồn tại 5 giây. Đồng minh trong vùng giảm 40% sát thương nhận, cộng thêm 1% Máu Tối Đa của Knight quy đổi thành % giảm sát thương; kẻ địch trong vùng bị Làm Chậm 30% Tốc Độ Di Chuyển.'
    }
  };

  /* ---------- lancer ---------- */
  G.CHIEU_TFM.lancer = {
    skill: function (S) {
      var p = S.p, luong = S.dmg(p.attack, p.attack_ratio, 'atk');
      S.dich(S.n.x, S.n.y, p.range, {}).forEach(function (m) {
        S.sat(m, luong, 'vl');
        S.day(m, p.knockback_speed, p.knockback_tick);
      });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range));
      var quaX = S.n.x + dx / d * (xa + S.BK * 2), quaY = S.n.y + dy / d * (xa + S.BK * 2);
      S.lao(S.n.x + dx / d * xa, S.n.y + dy / d * xa, p.speed, function () {
        if (m.chet <= 0) S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.lao(quaX, quaY, p.speed, null, {});     /* xuyên qua, ra phía sau mục tiêu */
      });
      return true;
    },
    ult: function (S) {
      var p = S.p, h = S.huong(), trung = {};
      var xa = S.kc(p.range);
      S.lao(S.n.x + h[0] * xa, S.n.y + h[1] * xa, p.speed, null, {
        moiBuoc: function () {
          S.dich(S.n.x, S.n.y, p.attack_range, { tuong: true }).forEach(function (m) {
            var id = m.i != null ? 'n' + m.i : m;
            if (trung[id]) return;
            trung[id] = 1;
            S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
            S.hat(m, p.airborne);
          });
        }
      });
      return true;
    }
  };

  /* ---------- lightning_mage ---------- */
  G.CHIEU_TFM.lightning_mage = {
    skill: function (S) {
      var p = S.p;
      var m0 = (S.muc && S.muc.doi !== S.n.doi) ? S.muc : S.dichGanNhat(p.range, { tuong: true });
      if (!m0) return false;
      var da = {};
      function bay(tu, muc) {
        da[muc.i != null ? 'n' + muc.i : muc] = 1;
        S.dan(muc, muc.x, muc.y, p.speed, function (bi) {
          if (bi.chet > 0) return;
          S.sat(bi, S.dmg(p.attack, p.attack_ratio, 'ap'), 'pt');
          S.fx({ loai: 'chieu', x: tu.x, y: tu.y, x2: bi.x, y2: bi.y });
          /* lan tối đa 4 lần — TFM2 không ghi rõ số lần lan, chọn 4 để tránh vòng lặp vô hạn [ĐỀ XUẤT] */
          if (Object.keys(da).length > 4) return;
          var ke = S.dich(bi.x, bi.y, p.splash_range, { tuong: true }).filter(function (x) { return !da[x.i != null ? 'n' + x.i : x]; })[0];
          if (ke) bay(bi, ke);
        });
      }
      bay(S.n, m0);
      return true;
    },
    mota: {
      skill: 'Lightning Mage phóng tia sét vào kẻ địch gần nhất trong tầm 80, gây Sát thương Phép 20 + 40% SMPT; sét tiếp tục lan sang mục tiêu khác trong bán kính 50 quanh điểm vừa trúng, không lan lại cùng một mục tiêu (tối đa 4 lần lan).'
    }
  };

  /* ---------- magic_knight ---------- */
  G.CHIEU_TFM.magic_knight = {
    skill: function (S) {
      /* "kích nổ ma thuật theo đường thẳng" — không có tốc đạn (đòn tức thời); xấp xỉ vùng đường
         thẳng bằng một vòng tròn ở điểm giữa đoạn thẳng, như cách LineRangeProjectile của cây hiệu
         ứng tướng mod đang làm (chieu.js). [ĐỀ XUẤT] */
      var p = S.p, h = S.huong(), xa = S.kc(p.range);
      var giuaX = S.n.x + h[0] * xa / 2, giuaY = S.n.y + h[1] * xa / 2;
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.dich(giuaX, giuaY, Math.max(p.attack_range, p.range / 2), { tuong: true }).forEach(function (m) { S.sat(m, luong, 'pt'); });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: S.n.x + h[0] * xa, y2: S.n.y + h[1] * xa });
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      var soLan = Math.max(1, Math.floor(p.tick / p.period));
      S.vung(diem[0], diem[1], p.attack_range, p.tick, p.period, function (V, ds) {
        ds.forEach(function (m) {
          S.sat(m, luong, 'pt');
          if (m.tuong || m.hienRa) S.keo(m, p.pull_speed, p.pull_time);
        });
      }, { ten: S.kn.ten });
      void soLan;
      return true;
    },
    ult: function (S) {
      var p = S.p;
      var tocdanh = p.attack_speed_increase + p.attack_speed_ap_ratio / 100 * S.cs.ap;
      S.buff(S.n, { tam: S.kc(p.range_increase), tocdanh: tocdanh }, p.tick, S.kn.ten);
      /* "mỗi đòn đánh thường kích hoạt Bộc Phát Ma Thuật" — không mô phỏng: S không có móc sự kiện
         đánh-thường để tự bắn thêm chiêu; cần nguyên thuỷ mới nếu muốn làm đúng (đã ghi vào kế hoạch
         nếu cần). */
      return true;
    },
    mota: {
      ult: 'Magic Knight giải phóng sức mạnh trong 5 giây: +20 Tầm Đánh và +30% + 10% SMPT Tốc Độ Đánh. (Chưa mô phỏng: mỗi đòn đánh thường tự kích hoạt lại Bộc Phát Ma Thuật — cần thêm móc sự kiện đánh-thường trong sim.)'
    }
  };

  /* ---------- monk ---------- */
  G.CHIEU_TFM.monk = {
    skill: function (S) {
      var p = S.p;
      var ds = S.dongMinh(S.n.x, S.n.y, p.range, { keMinh: true });
      if (!ds.length) return false;
      if (ds.length === 1 && ds[0] === S.n) {
        S.hoi(S.n, S.dmg(p.heal_self, p.attack_ratio, 'ap'));
      } else {
        var luong = S.dmg(p.heal, p.attack_ratio, 'ap');
        ds.forEach(function (m) { S.hoi(m, luong); });
      }
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: S.n.x, y2: S.n.y, hoi: true });
      return true;
    },
    skill2: function (S) {
      var p = S.p, diem = S.diemMuc();
      var luong = S.dmg(p.attack, p.attack_ratio, 'ap');
      S.sau(p.delayed, function () {
        S.dich(diem[0], diem[1], p.attack_range, { tuong: true }).forEach(function (m) {
          S.sat(m, luong, 'pt');
          S.choang(m, p.stun_duration);
        });
        S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.attack_range) });
      });
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(p.attack_range), cho: S.giay(p.delayed) });
      return true;
    },
    ult: function (S) {
      var p = S.p;
      var luong = S.dmg(p.shield, p.shield_ap_ratio, 'ap');
      S.dongMinh(S.n.x, S.n.y, p.range, { keMinh: true }).forEach(function (m) {
        S.chan(m, luong, p.shield_duration);
        S.buff(m, { tocchay: p.move_speed }, p.shield_duration, S.kn.ten);
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(p.range) });
      return true;
    },
    mota: {
      skill: 'Monk hồi Máu 100 + 50% SMPT cho các đồng minh trong phạm vi 80 quanh mình; nếu chỉ có một mình Monk trong phạm vi, lượng hồi tăng lên 200 + 50% SMPT.',
      ult: 'Monk tạo Lá Chắn 500 + 50% SMPT cho các đồng minh trong phạm vi 76 quanh mình trong 3 giây; đồng minh nhận lá chắn được +30% Tốc Độ Di Chuyển.'
    }
  };

  /* ---------- necromancer ---------- */
  G.CHIEU_TFM.necromancer = {
    skill: function (S) {
      var p = S.p, cap = S.n.cap || 1;
      var lau = p.ghoul_duration + (p.ghoul_duration_per_level || 0) * (cap - 1) + (p.ghoul_duration_by_spell_power || 0) * S.cs.ap / 100;
      var m = S.trieuHoi({ stat: p.stat, theoAP: p.stat_by_spell_power, danh: p.attack, lau: S.giay(lau), ten: S.kn.ten });
      S.n._ncNgaQui = m || null;
      return true;
    },
    skill2: function (S) {
      var p = S.p, q = S.n._ncNgaQui;
      /* "chỉ định mục tiêu tấn công" — S không có nguyên thuỷ ép quân triệu hồi đánh một mục tiêu cụ
         thể, bỏ qua phần này [ĐỀ XUẤT]. Ngạ Quỷ là thực thể `linh` (không có `.tuong`) nên S.buff
         (chỉ tác dụng lên `m.tuong`, xem `themBuff` trong sim.js) không ăn — sửa THẲNG hai trường số
         của chính nó (`hoiDanh` = giây giữa hai đòn, `tocchay` = tốc chạy đơn vị sim/giây), có hẹn giờ
         trả lại khi hết hạn thay vì stack buff. */
      if (!q || q.hp <= 0) return false;
      if (q._ncBuffToi && q._ncBuffToi > S.t) return true;   /* đang có buff, không chồng thêm */
      var tocdanhCong = p.attack_speed + p.attack_speed_by_spell_power / 100 * S.cs.ap;
      var tocchayCong = p.move_speed + p.move_speed_by_spell_power / 100 * S.cs.ap;
      var hoiDanhGoc = q.hoiDanh, tocchayGoc = q.tocchay;
      q.hoiDanh = hoiDanhGoc / (1 + tocdanhCong / 100);
      q.tocchay = tocchayGoc * (1 + tocchayCong / 100);
      q._ncBuffToi = S.t + S.giay(p.buff_duration);
      S.sau(p.buff_duration, function () { if (q.hp > 0) { q.hoiDanh = hoiDanhGoc; q.tocchay = tocchayGoc; } });
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: q.x, y2: q.y });
      return true;
    },
    ult: function (S) {
      var p = S.p, chet = null;
      S.tran.nguoi.forEach(function (m) { if (m.doi === S.n.doi && m !== S.n && m.chet > 0 && (!chet || m.chet > chet.chet)) chet = m; });
      if (!chet) return false;
      S.hoiSinh(chet, 0.35);
      /* TFM2 không ghi thời lượng Vong Linh tồn tại — chọn 20 giây làm giới hạn hợp lý [ĐỀ XUẤT] */
      S.lap(20, 60, function () { if (chet.chet <= 0 && chet.hp > 0) S.sat(chet, p.hp_drain_per_tick, 'thuc'); });
      return true;
    },
    mota: {
      ult: 'Necromancer hồi sinh Tướng đồng minh vừa tử trận gần nhất về 35% Máu Tối Đa dưới dạng Vong Linh; Vong Linh mất 2 Máu mỗi giây, trong tối đa 20 giây.'
    }
  };

  /* ---------- ninja ---------- */
  G.CHIEU_TFM.ninja = {
    skill: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      S.dan(m, m.x, m.y, p.speed, function (bi) {
        if (bi.chet > 0) return;
        S.sat(bi, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.lao(bi.x, bi.y, p.speed, null, {});
        S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: bi.x, y2: bi.y });
      }, { r: S.kc(p.attack_range) });
      return true;
    },
    skill2: function (S) {
      var p = S.p, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var xa = Math.min(d, S.kc(p.range)), dung = Math.max(0, xa - S.BK * 2);
      S.lao(S.n.x + dx / d * dung, S.n.y + dy / d * dung, 5000, function () {
        S.khongChon(p.hit_duration);
        S.lap(p.attack_count, Math.max(1, Math.floor(p.hit_duration / p.attack_count)), function () {
          if (m.chet > 0) return;
          S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        });
      });
      return true;
    },
    ult: function (S) {
      var p = S.p, m = S.dichGanNhat(p.range, { tuong: true });
      if (!m) return false;
      var dx = m.x - S.n.x, dy = m.y - S.n.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var dung = Math.max(0, d - S.BK * 2);
      S.lao(S.n.x + dx / d * dung, S.n.y + dy / d * dung, p.speed, function () {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(p.attack, p.attack_ratio, 'atk'), 'vl');
        S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      });
      return true;
    }
  };

  /* ══════════════════════════ 12 NÚT Native CỦA 5 TƯỚNG MOD ══════════════════════════
     casting_type/casting_target của mỗi chiêu đã chọn sẵn S.muc/S.x/S.y đúng nghĩa (G.chonMucChieu,
     nhánh tướng mod) nên không cần tự chọn mục tiêu như ba tướng gốc thiếu dữ liệu ở trên. */

  /* ---------- crossbowman ---------- */
  G.CHIEU_TFM.crossbowman = {
    skill: function (S) {
      var e = S.a.effect, ne = timNative(e), m = S.muc;
      if (!m) return false;
      S.dan(m, m.x, m.y, ne.speed, function (bi) {
        if (bi.chet > 0) return;
        var luong = S.dmg(0, ne.attack_ratio, 'atk');
        if (coDauCB(bi, S)) luong += S.dmg(0, ne.mark_bonus_attack_ratio, 'atk');
        S.sat(bi, luong, 'vl');
        S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: bi.x, y2: bi.y });
      }, { r: S.kc(ne.projectile_radius) });
      return true;
    },
    skill2: function (S) {
      var e = S.a.effect, ne = timNative(e);
      var h = S.huong(), xa = S.kc(ne.range);
      S.dan(null, S.n.x + h[0] * xa, S.n.y + h[1] * xa, ne.speed, function (bi) {
        if (bi.chet > 0) return;
        var luong = S.dmg(0, ne.attack_ratio, 'atk');
        if (coDauCB(bi, S)) luong += S.dmg(0, ne.mark_bonus_attack_ratio, 'atk');
        S.sat(bi, luong, 'vl');
      }, { r: S.kc(ne.projectile_radius), xuyen: true });
      /* "bản thân bị bay ngược về phía sau" — lao ngược hướng bắn, quãng đường = tốc (đổi đơn vị sim/tick) × backstep_tick */
      var luiXa = S.kc(ne.backstep_speed) * ne.backstep_tick;
      S.lao(S.n.x - h[0] * luiXa, S.n.y - h[1] * luiXa, ne.backstep_speed, null, {});
      return true;
    },
    ult: function (S) {
      var e = S.a.effect, ne = timNative(e), h = S.huong(), xa = S.kc(ne.range);
      S.dan(null, S.n.x + h[0] * xa, S.n.y + h[1] * xa, ne.speed, function (bi) {
        if (bi.chet > 0 || !bi.tuong) return;
        S.sat(bi, S.dmg(0, ne.attack_ratio, 'atk'), 'vl');
        bi._cbMarkToi = S.t + S.giay(ne.buff_duration);
        S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, x2: bi.x, y2: bi.y });
      }, { r: S.kc(ne.projectile_radius) });
      return true;
    },
    mota: {
      skill: 'Crossbowman bắn một mũi tên theo đường thẳng (tầm 150), gây Sát thương Vật lý 200% SMCK lên tướng địch đầu tiên trúng phải; nếu mục tiêu đang mang Dấu Ấn Vệt Sáng, gây thêm 60% SMCK.',
      skill2: 'Crossbowman bắn một mũi tên xuyên thấu theo đường thẳng (tầm 150), gây Sát thương Vật lý 130% SMCK lên kẻ địch trúng phải (thêm 50% SMCK nếu đang mang Dấu Ấn), đồng thời bản thân bị bắn ngược ra sau.',
      ult: 'Crossbowman bắn một vệt sáng theo đường thẳng (tầm 150), gây Sát thương Vật lý 80% SMCK lên Tướng địch đầu tiên trúng và để lại Dấu Ấn Vệt Sáng trong 5 giây. (Chưa mô phỏng: mọi kỹ năng tự trúng mục tiêu mang dấu bất kể khoảng cách, và phần giảm hồi chiêu — cần thêm nguyên thuỷ.)'
    }
  };

  /* ---------- strongman ---------- */
  G.CHIEU_TFM.strongman = {
    skill: function (S) {
      var ne = S.a.effect, m = S.muc;
      if (!m || m.doi === S.n.doi) return false;
      S.sat(m, S.dmg(ne.damage, ne.attack_ratio, 'atk'), 'vl');
      S.choang(m, ne.stun);
      /* "quật qua vai ra phía sau bản thân" — kéo mục tiêu tới điểm sau lưng Strongman */
      var h = S.huong();
      S.keo(m, ne.speed, 10, S.n.x - h[0] * S.kc(ne.move_distance), S.n.y - h[1] * S.kc(ne.move_distance));
      S.fx({ loai: 'chieu', x: S.n.x, y: S.n.y, x2: m.x, y2: m.y });
      return true;
    },
    ult: function (S) {
      var ne = S.a.effect, diem = S.diemMuc();
      var ban = dmGanNhat(S, ne.ally_range, true);
      function haCanh(x, y, laBan) {
        S.dich(x, y, ne.radius, { tuong: true }).forEach(function (m) {
          S.sat(m, S.dmg(ne.damage, ne.attack_ratio, 'atk'), 'vl');
          S.choang(m, ne.stun);
        });
        S.fx({ loai: 'cuoi', x: x, y: y, dien: true, r: S.kc(ne.radius) });
        if (laBan) S.chan(ban, ne.shield, ne.shield_duration);
        else S.choang(S.n, ne.self_stun);
      }
      if (ban) {
        S.sau(Math.max(1, Math.round(Math.hypot(diem[0] - S.n.x, diem[1] - S.n.y) / S.kc(ne.speed))), function () {
          ban.x = diem[0]; ban.y = diem[1]; ban.px = ban.x; ban.py = ban.y;
          haCanh(diem[0], diem[1], true);
        });
      } else {
        S.lao(diem[0], diem[1], ne.speed, function () { haCanh(diem[0], diem[1], false); }, {});
      }
      return true;
    },
    mota: {
      skill: 'Strongman tóm kẻ địch gần nhất trong tầm 30, quật ra sau lưng, gây Sát thương Vật lý 60 + 90% SMCK và Làm Choáng 0.5 giây.',
      ult: 'Strongman ném một đồng minh gần trong tầm 50 tới vị trí chỉ định (tầm 90); đồng minh hạ cánh nhận Lá Chắn 300 trong 4 giây. Kẻ địch trong bán kính 30 quanh điểm hạ cánh chịu Sát thương Vật lý 110 + 90% SMCK và Làm Choáng 1.5 giây. Không có đồng minh gần thì Strongman tự nhảy tới và tự Làm Choáng 1 giây.'
    }
  };

  /* ---------- spellbreaker ---------- */
  G.CHIEU_TFM.spellbreaker = {
    ult: function (S) {
      var ne = S.a.effect;
      S.dich(S.n.x, S.n.y, ne.radius, { tuong: true }).forEach(function (m) {
        var coChan = m.chan && m.chan.length > 0;
        if (coChan) {
          m.chan = [];        /* phá lá chắn — trường thực thể, cùng khuôn với themChan/satThuong trong sim.js */
          S.sat(m, S.dmg(ne.bonus_damage, ne.attack_ratio, 'ap'), 'pt');
          S.choang(m, ne.stun);
          /* "không thể nhận lá chắn trong {BlockTime} giây" — S chưa có cờ chặn lá chắn, bỏ qua [ĐỀ XUẤT] */
        } else {
          S.sat(m, ne.damage, 'pt');
        }
      });
      S.fx({ loai: 'cuoi', x: S.n.x, y: S.n.y, dien: true, r: S.kc(ne.radius) });
      return true;
    },
    mota: {
      ult: 'Spellbreaker phá huỷ toàn bộ lá chắn của kẻ địch trong bán kính 60 quanh mình. Kẻ địch bị phá lá chắn chịu Sát thương Phép 120 + 100% SMPT và Làm Choáng 1 giây. Kẻ địch không có lá chắn chỉ chịu 140 Sát thương Phép. (Chưa mô phỏng: cấm nhận lá chắn mới trong 3 giây sau đó.)'
    }
  };

  /* ---------- astrologer ---------- */
  G.CHIEU_TFM.astrologer = {
    skill: function (S) {
      var ne = S.a.effect, diem = S.diemMuc();
      S.fx({ loai: 'chieu', x: diem[0], y: diem[1], dien: true, r: S.kc(ne.radius), cho: S.giay(ne.delay) });
      S.sau(ne.delay, function () {
        S.dich(diem[0], diem[1], ne.radius, { tuong: true }).forEach(function (m) {
          S.sat(m, S.dmg(ne.damage, ne.attack_ratio, 'ap'), 'pt');
          S.cham(m, ne.slow_ratio, ne.slow_duration);
        });
      });
      return true;
    },
    skill2: function (S) {
      var ne = S.a.effect, h = S.huong(), xa = S.kc(ne.range || S.a.range || 80000);
      S.dan(null, S.n.x + h[0] * xa, S.n.y + h[1] * xa, 6000, function (m) {
        if (m.chet > 0) return;
        S.sat(m, S.dmg(ne.damage, ne.attack_ratio, 'ap'), 'pt');
        m._astroMarkToi = S.t + S.giay(ne.mark_duration);
      }, { r: S.kc(ne.line_width) / 2, xuyen: true });
      return true;
    },
    ult: function (S) {
      var ne = S.a.effect, diem = S.diemMuc();
      var ds = S.dich(diem[0], diem[1], ne.radius, { tuong: true });
      S.fx({ loai: 'cuoi', x: diem[0], y: diem[1], dien: true, r: S.kc(ne.radius), cho: S.giay(ne.delay) });
      S.sau(ne.delay, function () {
        var song = ds.filter(function (m) { return m.chet <= 0 && m.hp > 0; });
        var lien = Math.max(0, Math.min(song.length - 1, ne.max_amplify_targets));
        song.forEach(function (m) {
          var luong = S.dmg(ne.damage, ne.attack_ratio, 'ap') * (1 + ne.amplify * lien / 100);
          if (m._astroMarkToi && m._astroMarkToi > S.t) luong += S.dmg(0, ne.mark_bonus_attack_ratio, 'ap');
          S.sat(m, luong, 'pt');
        });
      });
      return true;
    },
    mota: {
      skill: 'Sau 0.5 giây, Astrologer triệu hồi thiên thạch rơi xuống vị trí chỉ định, gây Sát thương Phép 80 + 65% SMPT lên kẻ địch trong bán kính 34 và Làm Chậm 30% Tốc Độ Di Chuyển trong 1.5 giây.',
      skill2: 'Astrologer gây Sát thương Phép 70 + 75% SMPT theo đường thẳng (bề rộng 32) lên kẻ địch trúng và để lại Dấu Ấn Chòm Sao trong 5 giây; kẻ địch mang dấu ấn nhận thêm sát thương từ vụ nổ của Thiên Thể Thẳng Hàng.',
      ult: 'Astrologer đánh dấu mọi kẻ địch trong bán kính 60; sau 1.5 giây các dấu ấn đồng loạt phát nổ, gây Sát thương Phép 110 + 70% SMPT, tăng 10% sát thương cho mỗi kẻ địch liên kết thêm (tối đa +40% với 4 kẻ). Kẻ địch đã mang Dấu Ấn Chòm Sao từ trước chịu thêm 25% SMPT sát thương.'
    }
  };

  /* ---------- harpooner ---------- */
  G.CHIEU_TFM.harpooner = {
    skill: function (S) {
      var ne = S.a.effect, h = S.huong(), xa = S.kc(S.a.range || 90000);
      S.dan(null, S.n.x + h[0] * xa, S.n.y + h[1] * xa, ne.speed, function (m) {
        if (m.chet > 0 || !m.tuong) return;
        S.sat(m, S.dmg(ne.damage, ne.attack_ratio, 'atk'), 'vl');
        /* "tái kích hoạt để kéo mình/kéo mục tiêu" — không có input tái bấm trong S; đơn giản hoá
           bằng cách tự kéo mục tiêu lại gần ngay khi trúng. [ĐỀ XUẤT] */
        S.keo(m, ne.target_pull_speed, 15);
      }, { r: S.kc(ne.projectile_radius) });
      return true;
    },
    skill2: function (S) {
      var ne = S.a.effect, h = S.huong(), xa = S.kc(S.a.range || 110000);
      S.dan(null, S.n.x + h[0] * xa, S.n.y + h[1] * xa, ne.speed, function (m) {
        if (m.chet > 0) return;
        var luong = S.dmg(ne.damage, ne.attack_ratio, 'atk') + (m.hpMax - m.hp) * ne.missing_hp_ratio / 100;
        S.sat(m, luong, 'vl');
      }, { r: S.kc(ne.projectile_radius) });
      return true;
    },
    ult: function (S) {
      var ne = S.a.effect, h = S.huong();
      var buoc = ne.projectile_count > 1 ? ne.fan_angle / (ne.projectile_count - 1) : 0;
      var batDau = -ne.fan_angle / 2;
      var boTroi = [];
      for (var i = 0; i < ne.projectile_count; i++) {
        (function (i2) {
          S.sau(i2 * ne.shot_interval, function () {
            var hg = xoayVecto(h, batDau + buoc * i2);
            var xa = S.kc(S.a.range || 130000);
            S.dan(null, S.n.x + hg[0] * xa, S.n.y + hg[1] * xa, ne.speed, function (m) {
              if (m.chet > 0 || !(m.tuong || m.hienRa)) return;
              S.sat(m, S.dmg(ne.damage, ne.attack_ratio, 'atk'), 'vl');
              S.troi(m, ne.link_duration);
              S.cham(m, ne.slow_ratio, ne.link_duration);
              boTroi.push(m);
            }, { r: S.kc(ne.projectile_radius) });
          });
        })(i);
      }
      /* xích siết: hai mục tiêu trói đầu tiên cách xa quá link_range thì tăng chậm + kéo lại gần nhau */
      S.sau(ne.projectile_count * ne.shot_interval + 5, function () {
        var soLan = Math.max(1, Math.floor(ne.link_duration / 10));
        S.lap(soLan, 10, function () {
          if (boTroi.length < 2) return;
          var a = boTroi[0], b = boTroi[1];
          if (a.chet > 0 || b.chet > 0) return;
          var d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > S.kc(ne.link_range)) {
            S.cham(a, ne.tension_slow_ratio, 12); S.cham(b, ne.tension_slow_ratio, 12);
            S.keo(a, ne.pull_speed, 12, b.x, b.y); S.keo(b, ne.pull_speed, 12, a.x, a.y);
          }
        });
      });
      return true;
    },
    mota: {
      skill: 'Harpooner bắn một lao móc theo đường thẳng (tầm 90), gây Sát thương Vật lý 120 + 110% SMCK lên tướng địch đầu tiên trúng và kéo mục tiêu lại gần. (Đơn giản hoá: không mô phỏng phần tái kích hoạt để tự chọn kéo mình hay kéo địch.)',
      skill2: 'Harpooner bắn một lao móc mạnh theo đường thẳng (tầm 110), gây Sát thương Vật lý 150 + 140% SMCK + 12% lượng Máu đã mất của mục tiêu, lên kẻ địch đầu tiên trúng.',
      ult: 'Harpooner bắn 5 lao móc xích thành hình quạt 36° phía trước (tầm 130), mỗi lao gây Sát thương Vật lý 150 + 110% SMCK và trói mục tiêu trúng đòn trong 4 giây kèm Làm Chậm 30%. Hai mục tiêu bị trói cách xa nhau quá 50 thì xích siết lại: Làm Chậm tăng lên 60% và bị kéo lại gần nhau.'
    }
  };

  /* trợ giúp riêng cho nhóm Native: tìm đúng nút Native trong cây (Combine > [..., Native]) —
     hầu hết Native nằm ngay ở gốc (`a.effect.type==='Native'`) hoặc trong effects[] của một Combine
     ở gốc (crossbowman). */
  function timNative(e) {
    if (!e) return {};
    if (e.type === 'Native') return e;
    if (e.type === 'Combine' && e.effects) {
      for (var i = 0; i < e.effects.length; i++) if (e.effects[i].type === 'Native') return e.effects[i];
    }
    return e;
  }
  function coDauCB(m, S) { return m._cbMarkToi && m._cbMarkToi > S.t; }

})(window);
