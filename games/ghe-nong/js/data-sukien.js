/* data-sukien.js — sự kiện ngẫu nhiên trong ca huấn luyện.
   Uma nổ sự kiện sau gần như mọi hành động, mỗi cái là một cảnh ngắn có lựa chọn, và kết quả
   được ghi từng dòng vào Nhật ký (RESEARCH.md §1.7). Ở đây làm đúng vậy.

   kq (kết quả một lựa chọn):
     cs      { co: 10, nao: 5 }   cộng chỉ số
     kn      số điểm kỹ năng
     luc     thể lực
     tam     bậc tâm trạng
     than    thân thiết với người trong cảnh
     thanAll thân thiết với cả 5
     xau     id trạng thái xấu
     goXau   gỡ một trạng thái xấu
     goiY    cho một cấp gợi ý ngẫu nhiên
     fan     danh tiếng
     ngau    [min,max] nhân vào toàn bộ (dùng cho lựa chọn hên xui)
*/
(function (G) {
  'use strict';

  function S(id, tieu, chu, chon, dk) {
    return { id: id, tieu: tieu, chu: chu, chon: chon, dk: dk || null };
  }

  /* ══════ sự kiện chung ══════ */
  G.SUKIEN = [
    S('ngu_gat', 'Ngủ gật trong phòng họp',
      'Một người gục xuống bàn giữa buổi mổ băng. Cả phòng nhìn bạn.',
      [{ chu: 'Cho nghỉ, mai họp lại', kq: { luc: 20, tam: 1, than: 4 } },
       { chu: 'Dội nước lạnh, họp tiếp', kq: { kn: 25, tam: -1, luc: -5 } }]),

    S('cai_nhau', 'Hai đứa cãi nhau trong phòng máy',
      'Đường trên đổ tại đi rừng. Đi rừng bảo đường trên đứng sai chỗ. Không ai nhường.',
      [{ chu: 'Bắt hai đứa xem lại băng cùng nhau', kq: { cs: { nao: 12 }, thanAll: 3 } },
       { chu: 'Phạt cả hai, dẹp chuyện này', kq: { cs: { li: 14 }, tam: -1 } },
       { chu: 'Kệ, để tụi nó tự giải quyết', kq: { ngau: [0, 2], thanAll: 5, xau: 'cai_nhau' } }]),

    S('fan_tang', 'Người hâm mộ gửi quà tới trụ sở',
      'Một thùng đồ ăn và mấy trăm lá thư viết tay. Có đứa đọc xong đỏ mắt.',
      [{ chu: 'Đọc to cho cả đội nghe', kq: { tam: 2, thanAll: 4, fan: 800 } },
       { chu: 'Cảm ơn rồi tập tiếp', kq: { kn: 15, cs: { li: 8 } } }]),

    S('bao_chi', 'Nhà báo hỏi xoáy',
      '"Đội anh mùa trước thua sạch vòng bảng. Năm nay có gì khác không?"',
      [{ chu: '"Chờ mà xem."', kq: { cs: { li: 16 }, fan: 500 } },
       { chu: '"Chúng tôi đã sửa rất nhiều."', kq: { cs: { nao: 10 }, kn: 15 } },
       { chu: 'Bỏ đi không trả lời', kq: { xau: 'drama', fan: -300, cs: { li: 6 } } }]),

    S('mua_do', 'Máy hỏng giữa buổi tập',
      'Màn hình của xạ thủ tắt ngóm. Kỹ thuật viên bảo phải hai ngày mới có hàng thay.',
      [{ chu: 'Bỏ tiền túi mua ngay', kq: { cs: { co: 14 }, than: 6 } },
       { chu: 'Cho tập chay trên máy cũ', kq: { cs: { li: 10 }, tam: -1 } }]),

    S('scrim_thang', 'Thắng đậm một buổi tập đấu',
      'Đội hạng trên sang giao hữu và bị dọn sạch ba ván.',
      [{ chu: 'Khen cả đội', kq: { tam: 1, thanAll: 4, kn: 20 } },
       { chu: '"Chưa là gì cả, tập tiếp."', kq: { cs: { nao: 14, li: 8 } } }]),

    S('scrim_thua', 'Thua sạch một buổi tập đấu',
      'Không ai nói gì. Có đứa tháo tai nghe đứng dậy ra ngoài.',
      [{ chu: 'Ngồi lại mổ từng pha', kq: { cs: { nao: 18 }, luc: -12 } },
       { chu: 'Cho nghỉ sớm, mai tính', kq: { luc: 25, tam: 1 } },
       { chu: 'Bắt tập lại từ đầu ngay', kq: { cs: { co: 12, li: 10 }, luc: -20, tam: -1 } }]),

    S('ngoi_sao', 'Có đội khác hỏi mua người',
      'Một CLB lớn nhắn tin cho người giỏi nhất của bạn. Nó kể lại với bạn, thật thà.',
      [{ chu: '"Ở lại, tôi cho em cái cúp."', kq: { than: 12, cs: { li: 10 } } },
       { chu: '"Em tự quyết."', kq: { cs: { nao: 12 }, than: -4 } }]),

    S('sinh_nhat', 'Sinh nhật một thành viên',
      'Bánh kem trong phòng ăn, nến gãy, nhưng ai cũng cười.',
      [{ chu: 'Nghỉ tập một buổi', kq: { tam: 2, thanAll: 6, luc: 15 } },
       { chu: 'Cắt bánh xong tập tiếp', kq: { tam: 1, thanAll: 3, kn: 12 } }]),

    S('meta_moi', 'Bản cập nhật mới ra',
      'Ba tướng bị chỉnh mạnh tay. Cả phòng cãi nhau tướng nào lên kèo.',
      [{ chu: 'Ngồi đọc kỹ bản cập nhật cùng cả đội', kq: { cs: { nao: 20 }, kn: 20, luc: -8 } },
       { chu: 'Cứ đánh như cũ đã', kq: { cs: { co: 10, li: 6 } } }]),

    S('an_khuya', 'Ăn khuya sau buổi tập',
      'Cả đội kéo nhau đi ăn lúc 1 giờ sáng. Chủ quán quen mặt.',
      [{ chu: 'Đi cùng, trả tiền', kq: { thanAll: 6, tam: 1, luc: -5 } },
       { chu: 'Về ngủ, mai còn tập', kq: { luc: 18, cs: { ben: 8 } } }]),

    S('chan_thuong', 'Cổ tay đau',
      'Xạ thủ giấu chuyện cổ tay đau ba hôm nay mới nói.',
      [{ chu: 'Ép nghỉ, đưa đi khám', kq: { luc: 25, than: 8, kn: -10 } },
       { chu: 'Đeo nẹp rồi tập nhẹ', kq: { xau: 'moi_tay', cs: { co: 12 } } }]),

    S('tap_khuya', 'Có người tập một mình lúc nửa đêm',
      'Bạn quay lại trụ sở lấy đồ và thấy đèn phòng máy còn sáng.',
      [{ chu: 'Ngồi xuống tập cùng', kq: { cs: { co: 16 }, than: 10, luc: -15 } },
       { chu: 'Bắt đi ngủ', kq: { luc: 10, cs: { ben: 10 }, than: 5 } }]),

    S('doi_lich', 'Ban tổ chức đổi lịch thi đấu',
      'Trận kế bị dời sớm hai ngày. Không hỏi ai.',
      [{ chu: 'Nén lịch tập lại', kq: { cs: { nao: 12, li: 8 }, luc: -12 } },
       { chu: 'Giữ nguyên, coi như thêm ngày nghỉ', kq: { luc: 15, tam: 1 } }]),

    S('sponsor', 'Nhà tài trợ ghé thăm',
      'Ba người mặc vest đứng xem tập, gật gù, không hiểu gì.',
      [{ chu: 'Diễn một buổi cho đẹp', kq: { fan: 1200, tam: -1 } },
       { chu: 'Tập như thường', kq: { cs: { li: 10 }, kn: 12 } }]),

    S('hoc_tuong', 'Một người đòi học tướng mới',
      '"Em thấy con này hợp em. Cho em tập thử tuần này."',
      [{ chu: 'Cho học', kq: { kn: 25, than: 6, luc: -10 }, hocTuong: true },
       { chu: '"Đánh cái em quen đã."', kq: { cs: { co: 12, li: 6 } } }]),

    S('mat_dien', 'Mất điện cả khu',
      'Không máy, không mạng. Cả đội ngồi ngoài sân.',
      [{ chu: 'Ngồi vẽ chiến thuật ra giấy', kq: { cs: { nao: 22 }, thanAll: 4 } },
       { chu: 'Đá bóng ngoài sân', kq: { luc: 20, tam: 2, cs: { ben: 8 } } }]),

    S('binh_luan', 'Bình luận viên chê đội bạn trên sóng',
      '"Đội này không có bản sắc gì cả." Câu đó lan khắp mạng xã hội.',
      [{ chu: 'Cho cả đội xem lại đoạn đó', kq: { cs: { li: 20 }, tam: -1 } },
       { chu: 'Cấm cả đội lên mạng một tuần', kq: { cs: { nao: 10 }, tam: 1, than: -3 } }]),

    S('tan_binh', 'Tân binh xin vào tập ké',
      'Một đứa 16 tuổi rank cao ngất xin vào ngồi xem một buổi.',
      [{ chu: 'Cho vào, xếp nó đánh với cả đội', kq: { cs: { co: 14 }, kn: 15, tam: 1 } },
       { chu: 'Từ chối, giữ nếp', kq: { cs: { li: 8, nao: 8 } } }]),

    S('gia_dinh', 'Nhà một thành viên gọi lên',
      '"Bao giờ nó về? Bố mẹ nó không thích cái nghề này."',
      [{ chu: 'Gọi điện nói chuyện với gia đình', kq: { than: 14, cs: { li: 10 }, luc: -8 } },
       { chu: 'Để nó tự lo', kq: { cs: { nao: 8 }, than: -5 } }])
  ];

  /* ══════ sự kiện riêng của tuyển thủ (mở theo mốc thân thiết) ══════ */
  G.SUKIEN_TT = {
    20: S('tt20', 'Nói chuyện riêng sau buổi tập',
      '"Thầy... em thấy em đá chưa xứng suất này."',
      [{ chu: '"Em cứ đá cái em giỏi nhất."', kq: { than: 10, cs: { li: 12 } } },
       { chu: '"Vậy thì tập tới lúc xứng."', kq: { than: 6, cs: { co: 14 }, luc: -8 } }]),
    50: S('tt50', 'Rủ đi ăn',
      'Nó rủ bạn đi ăn, trả tiền bằng lương tháng đầu tiên.',
      [{ chu: 'Để nó trả', kq: { than: 14, tam: 1 } },
       { chu: 'Giành trả', kq: { than: 8, tam: 1, cs: { nao: 8 } } }]),
    80: S('tt80', 'Trước trận lớn',
      'Nó đứng ngoài hành lang, tay run. "Em không muốn làm hỏng của mọi người."',
      [{ chu: '"Không hỏng được đâu. Tôi chọn em mà."', kq: { than: 16, cs: { li: 20 }, tam: 1 } },
       { chu: 'Vỗ vai, không nói gì', kq: { than: 10, cs: { li: 12 } } }])
  };

  /* ══════ rút và áp sự kiện ══════ */
  G.rutSuKien = function (ca) {
    var rng = ca.rng;

    /* ưu tiên sự kiện riêng khi vừa chạm mốc thân thiết */
    for (var i = 0; i < ca.tt.length; i++) {
      var m = ca.than[i];
      ca._daSk = ca._daSk || {};
      var moc = m >= 80 ? 80 : m >= 50 ? 50 : m >= 20 ? 20 : 0;
      if (moc) {
        var khoa = ca.tt[i] + '_' + moc;
        if (!ca._daSk[khoa] && rng.duoc(0.7)) {
          ca._daSk[khoa] = 1;
          var sk = JSON.parse(JSON.stringify(G.SUKIEN_TT[moc]));
          sk.nguoi = i;
          sk.tenNguoi = G.TUYENTHU_THEO_ID[ca.tt[i]].ten;
          return sk;
        }
      }
    }

    ca._daSkC = ca._daSkC || {};
    var conLai = G.SUKIEN.filter(function (s) { return !ca._daSkC[s.id]; });
    if (!conLai.length) { ca._daSkC = {}; conLai = G.SUKIEN; }
    var s2 = JSON.parse(JSON.stringify(rng.chon(conLai)));
    ca._daSkC[s2.id] = 1;
    s2.nguoi = rng.nguyen(ca.tt.length);
    s2.tenNguoi = G.TUYENTHU_THEO_ID[ca.tt[s2.nguoi]] ? G.TUYENTHU_THEO_ID[ca.tt[s2.nguoi]].ten : '';
    return s2;
  };

  G.apSuKien = function (ca, sk, iChon) {
    var kq = sk.chon[iChon].kq || {}, ghi = [], rng = ca.rng;
    var he = 1;
    if (kq.ngau) he = kq.ngau[0] + rng() * (kq.ngau[1] - kq.ngau[0]);

    if (kq.cs) {
      for (var k in kq.cs) {
        var idx = G.SAN.indexOf(k); if (idx < 0) continue;
        var v = Math.round(kq.cs[k] * he);
        ca.chiso[idx] = G.kep(ca.chiso[idx] + v, 0, ca.tran[idx]);
        ghi.push({ t: G.TEN_CHISO[idx], v: v });
      }
    }
    if (kq.kn) { var kn = Math.round(kq.kn * he); ca.diemKN = Math.max(0, ca.diemKN + kn); ghi.push({ t: 'Điểm KN', v: kn, vang: true }); }
    if (kq.luc) { var l = Math.round(kq.luc * he); ca.theluc = G.kep(ca.theluc + l, 0, ca.thelucMax); ghi.push({ t: 'Thể lực', v: l }); }
    if (kq.tam) { var t0 = ca.tam; ca.tam = G.kep(ca.tam + kq.tam, 0, 4); if (ca.tam !== t0) ghi.push({ t: 'Tâm trạng', v: ca.tam - t0 }); }
    if (kq.than && sk.nguoi != null) {
      var i = sk.nguoi, tr = ca.than[i];
      ca.than[i] = G.kep(ca.than[i] + Math.round(kq.than * he), 0, 100);
      ghi.push({ t: 'Thân thiết ' + (G.TUYENTHU_THEO_ID[ca.tt[i]] || {}).biet, v: ca.than[i] - tr });
    }
    if (kq.thanAll) {
      for (var j = 0; j < ca.than.length; j++) ca.than[j] = G.kep(ca.than[j] + Math.round(kq.thanAll * he), 0, 100);
      ghi.push({ t: 'Thân thiết cả đội', v: Math.round(kq.thanAll * he) });
    }
    if (kq.fan) { G.S.clb.fan = Math.max(0, G.S.clb.fan + Math.round(kq.fan * he)); ghi.push({ t: 'Danh tiếng', v: Math.round(kq.fan * he), vang: true }); }
    if (kq.xau && ca.trangThai.indexOf(kq.xau) < 0) { ca.trangThai.push(kq.xau); ghi.push({ t: 'Dính: ' + G.TEN_TRANGTHAI[kq.xau], v: 0, xau: true }); }
    if (kq.goXau && ca.trangThai.length) { var b = ca.trangThai.shift(); ghi.push({ t: 'Gỡ: ' + G.TEN_TRANGTHAI[b], v: 0, vang: true }); }
    if (kq.goiY) {
      var ds = Object.keys(G.KN_THEO_ID);
      var idk = rng.chon(ds);
      ca.hint[idk] = (ca.hint[idk] || 0) + 1;
      ghi.push({ t: 'Gợi ý: ' + G.KN_THEO_ID[idk].ten, v: 0, vang: true });
    }

    ca.log.push({ luot: ca.luot, tieu: sk.tieu, dong: ghi });
    return ghi;
  };

})(window);
