/* giai.js — điều phối một giải đấu: dựng đối thủ, báo cáo, ban/pick, chiến thuật, thi đấu.

   Chuỗi màn lấy theo Teamfight Manager 2 (RESEARCH.md §2.6–2.9):
     Lịch → Báo cáo đối thủ → Ban/Pick → Giao tướng → Chiến thuật → Trận → Kết quả
*/
(function (G) {
  'use strict';

  /* ══════════ dựng đội đối thủ ══════════ */
  function taoDoiMay(ca, giai) {
    var rng = ca.rng;
    var nhom = G.NHOM_DOI[giai.doi] || G.NHOM_DOI.ai_low;
    var goc = G.DOI_THEO_ID[nhom[rng.nguyen(nhom.length)]];
    var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];
    var ten = rng.tron(G.TEN_MAY);

    return {
      goc: goc, ten: goc.ten, mau: goc.mau,
      nguoi: VT.map(function (vt, i) {
        /* Mỗi người máy có bảng thông thạo riêng, để việc cấm tướng có ý nghĩa. BẬC CỦA GIẢI
           quyết định họ thạo tới đâu: đội vòng bảng không được phép ai cũng có tướng UR.

           Đo bằng máy trước khi sửa: năm thẻ khởi đầu của người chơi cao nhất chỉ SR, trong khi
           mọi đội máy — kể cả Mèo Đá ở giải đầu tiên — đều có bốn người UR. Kết quả: thắng 0/40
           ở tất cả tám giải. Không phải người chơi dở, là bảng số sai. */
        /* Bảng thông thạo của đội máy theo bậc giải. Bốn ô = bốn tướng của vị trí ấy,
           xếp ngẫu nhiên — nên ĐỘ SÂU quan trọng hơn đỉnh: bậc 5 cũ cho cả bốn tướng từ
           SR trở lên, tức là người chơi cấm gì họ cũng còn một con thạo, và chung kết
           thế giới rơi xuống 8% (đo bằng _tools/tileThang.js). Giờ bậc 5 có MỘT con UR
           còn lại mỏng dần: ngôi sao của họ vẫn bất khả xâm phạm, nhưng cấm đúng con đó
           là kéo họ về mặt đất — đúng thứ màn cấm chọn đang mời người chơi làm. */
        /* `[ĐO TRONG REPO]` Đợt làm lại bộ mô phỏng (RESEARCH.md §8) kéo hai giải mở màn
           tụt khỏi đường cong đã chốt: Vòng bảng Lượt 1 **75% → 58%**, Lượt 2 **85% → 70%**
           (160 mẫu mỗi dòng, sai số ±3,9 điểm — lệch thật, không phải nhiễu).
           Thử hạ `suc` của bốn đội `ai_low` hơn một nửa (58→20 …) chỉ lấy lại được 4–9
           điểm: **chỉ số nền không phải cái cần vặn, bảng thông thạo mới là**. Vặn ở đây
           thì giữ nguyên được sức của 24 đội trong bảng xếp hạng chạy song song cả mùa.

           Đo trên 160 mẫu mỗi mức (bốn dãy hạt giống × 40 giải):
             bậc 1  R·R·N·N → Lượt 1 **58%** · Lượt 2 70%
                    R·N·N·N → Lượt 1   59% · Lượt 2 74%     (gần như không đổi)
                    N·N·N·N → Lượt 1 **79%** · Lượt 2 **86%**  ← khớp đường cong 75/85
             bậc 2  SR·SR·R·N → Play-off 37% · CK quốc nội 61%
                    SR·R·R·N  → Play-off **54%** · CK quốc nội **73%**  ← khớp 57/75

           Bậc 1 thành ra KHÔNG có ô thông thạo nào, tức là cấm tướng ở hai giải vòng bảng
           không còn ý nghĩa. Đó là cố ý: hai giải ấy là bậc tập sự, và đường cong thiết kế
           đòi người chơi thắng 75–85% ở đó. Từ bậc 2 trở đi mới có ngôi sao để mà cấm. */
        var THEO_BAC = {
          1: ['N', 'N', 'N', 'N'],
          2: ['SR', 'R', 'R', 'N'],
          3: ['SSR', 'SR', 'SR', 'R'],
          4: ['SSR', 'SSR', 'SR', 'R'],
          5: ['UR', 'SSR', 'SR', 'R']
        };
        var thang = THEO_BAC[giai.bac] || THEO_BAC[1];
        var ds = G.tuongTheoViTri(vt);
        var tron = rng.tron(ds);
        var tt = {};
        tron.forEach(function (t, k) { if (thang[k]) tt[t.id] = thang[k]; });
        return {
          vt: vt, ten: ten[i], tt: tt,
          chat: [rng.chon(['fight', 'farm', 'le', 'gank', 'thu', 'poke', 'lao', 'mt', 'solo', 'lead'])],
          ego: rng.khoang(20, 80)
        };
      })
    };
  }

  /* ══════════ đổi ca + đội thành cấu hình cho bộ mô phỏng ══════════ */
  function hesoTu(ca) {
    var ds = [];
    ca.kyNang.forEach(function (id) {
      var k = G.knTatCa(id);
      if (k) ds.push({ loai: k.hieu.loai, pha: k.hieu.pha, muc: k.hieu.muc, dk: k.hieu.dk });
    });
    var goc = G.HLV_THEO_ID[ca.hlvId];
    var r = G.KN_RIENG[goc.kn];
    if (r) ds.push({ loai: r.hieu.loai, pha: r.hieu.pha, dk: r.hieu.dk,
      muc: r.hieu.muc * G.heKNRieng(ca.uncap) });
    /* Danh tính của kỹ năng riêng đi kèm xuống bộ mô phỏng, để nó còn BẮN RA ĐƯỢC một
       hào quang và một dòng băng đúng lúc điều kiện bật lên. Trước đây chỉ có con số
       `muc` đi xuống, nên suốt trận người chơi không thấy kỹ năng của huấn luyện viên
       mình chọn xuất hiện lần nào. */
    return { ds: ds, rieng: r ? { id: goc.kn, ten: r.ten, pha: r.hieu.pha, dk: r.hieu.dk } : null };
  }

  /** năng khiếu khớp giải tới đâu → hệ số chung cho cả đội (DESIGN.md §2.3) */
  G.heNangKhieu = function (ca, giai) {
    var hSan = G.hesoNangKhieu(ca.nk.san[giai.sanDau] || 'C');
    var hNhip = G.hesoNangKhieu(ca.nk.nhip[giai.nhip] || 'C');
    /* thế trận: lấy hạng cao nhất, vì đội sẽ đá theo lối mạnh nhất của huấn luyện viên */
    var cao = 'G';
    for (var k in ca.nk.the) if (G.THU_TU_NK.indexOf(ca.nk.the[k]) > G.THU_TU_NK.indexOf(cao)) cao = ca.nk.the[k];
    var hThe = G.hesoNangKhieu(cao);
    return { san: hSan, nhip: hNhip, the: hThe, chung: (hSan * hNhip * hThe) };
  };

  function cauHinhTa(ca, giai, pick) {
    var he = G.heNangKhieu(ca, giai);
    var heso = hesoTu(ca);
    /* năng khiếu hợp giải thì cả đội khoẻ lên, không hợp thì yếu đi — cộng vào như một kỹ năng */
    heso.ds.push({ loai: 'hop', pha: 'luon', muc: he.chung - 1, dk: null });

    return {
      ten: G.S.clb.ten, mau: '#3ddc97', heso: heso,
      chienThuat: ca.chienThuat || {},
      nguoi: ca.tt.map(function (id, i) {
        var g = G.TUYENTHU_THEO_ID[id];
        var b = G.coTT(id) || { id: id, cap: 1, uncap: 0 };
        var tuongId = pick.ta[g.vt];
        /* sao vị trí của tuyển thủ nhân nhẹ vào chỉ số của huấn luyện viên */
        var heSao = 0.9 + g.vtSao * 0.03;
        return {
          vt: g.vt, tuyenthuId: id, tuongId: tuongId,
          tt: G.thongThao(b, tuongId),
          ten: g.biet, chat: g.chat, ego: g.ego,
          cs: {
            co: ca.chiso[0] * heSao, ben: ca.chiso[1] * heSao, luc: ca.chiso[2] * heSao,
            li: ca.chiso[3] * heSao, nao: ca.chiso[4] * heSao
          }
        };
      })
    };
  }

  function cauHinhDich(doiMay, pick, giai) {
    var suc = doiMay.goc.suc;
    var ds = [];
    /* đội máy cũng có "kỹ năng huấn luyện viên" theo thế trận của họ */
    if (doiMay.goc.the === 'baodau') ds.push({ loai: 'sat', pha: 'dau', muc: 0.10 });
    if (doiMay.goc.the === 'nuoimuon') ds.push({ loai: 'chiu', pha: 'dau', muc: 0.08 }, { loai: 'sat', pha: 'cuoi', muc: 0.08 });
    if (doiMay.goc.the === 'bungcuoi') ds.push({ loai: 'sat', pha: 'cuoi', muc: 0.14 });
    if (doiMay.goc.the === 'bamnhip') ds.push({ loai: 'hop', pha: 'giua', muc: 0.08 });

    return {
      ten: doiMay.ten, mau: doiMay.mau, heso: { ds: ds },
      chienThuat: { rong: 'tuy', rung: doiMay.goc.the === 'baodau' ? 'gank' : 'farm',
        mucTieu: doiMay.goc.the === 'baodau' ? 'lao' : 'poke' },
      nguoi: doiMay.nguoi.map(function (n) {
        var tuongId = pick.dich[n.vt];
        return {
          vt: n.vt, tuyenthuId: null, tuongId: tuongId,
          tt: n.tt[tuongId] || 'N',
          ten: n.ten, chat: n.chat, ego: n.ego,
          cs: { co: suc, ben: suc, luc: suc, li: suc, nao: suc }
        };
      })
    };
  }

  /* ══════════ báo cáo phân tích trước trận ══════════ */
  function baoCao(ca, doiMay, giai) {
    var n = G.el('div');
    n.appendChild(G.el('div', { html: '<b>' + giai.ten + '</b> · thể thức ' + giai.the + ' · sân ' +
      (giai.sanDau === 'lan' ? 'LAN (có khán giả)' : 'thi đấu mạng') + ' · nhịp trận dự kiến ' +
      G.TEN_NHIP[giai.nhip], style: 'margin-bottom:8px' }));

    var he = G.heNangKhieu(ca, giai);
    var hopY = he.chung >= 1.05 ? ['Giải này hợp lối của đội.', '#3ddc97']
      : he.chung >= 0.97 ? ['Giải này không lợi cũng không hại.', '#8b98a9']
      : ['Giải này KHÔNG hợp lối của đội — phải chữa bằng cấm chọn.', '#e5484d'];
    n.appendChild(G.el('div', { text: hopY[0], style: 'color:' + hopY[1] + ';margin-bottom:10px;font-weight:700' }));

    n.appendChild(G.el('div', { html: 'Đối thủ: <b>' + doiMay.ten + '</b> — lối chơi <b>' +
      (G.TEN_THE[doiMay.goc.the] || doiMay.goc.the) + '</b>', style: 'margin-bottom:6px' }));

    /* Họ đang đứng thứ mấy và đang thắng hay đang thua — thứ duy nhất biến một cái tên thành
       một đối thủ. Không có dòng này thì bảng xếp hạng chỉ là một trang để xem cho vui. */
    if (G.hangDoi) {
      var hd = G.hangDoi(doiMay.goc.id);
      var ht2 = G.hangTa ? G.hangTa() : null;
      var ph = hd && hd.h.phong.length ? hd.h.phong.slice(0, 5).join('') : '—';
      n.appendChild(G.el('div', {
        html: 'Họ đang hạng <b style="color:#ffd76e">' + (hd ? hd.hang : '?') + '</b>' +
          (hd ? ' (' + hd.h.thang + 'T ' + hd.h.thua + 'H)' : '') +
          ' · phong độ <b>' + ph + '</b>' +
          (ht2 ? '  —  ta đang hạng <b style="color:#3ddc97">' + ht2.hang + '/' + ht2.tong + '</b>' : ''),
        style: 'font-size:12px;color:#8b98a9;margin-bottom:6px'
      }));
      n.appendChild(G.el('div', { text: '“' + doiMay.goc.tieu + '”',
        style: 'font-size:12px;color:#7f8b9c;font-style:italic;margin-bottom:10px' }));
    }

    /* lộ bao nhiêu người phụ thuộc NÃO của huấn luyện viên — vai trò của analyst */
    var lo = 2 + Math.floor(ca.chiso[4] / 300);
    n.appendChild(G.el('div', { text: 'Ban phân tích đọc được ' + Math.min(5, lo) + '/5 người của họ (NÃO càng cao càng lộ nhiều).',
      style: 'font-size:12px;color:#8b98a9;margin-bottom:8px' }));

    var b = G.el('div');
    doiMay.nguoi.forEach(function (p, i) {
      var d = G.el('div', { style: 'display:flex;gap:8px;align-items:center;padding:5px 7px;border-radius:8px;' +
        'background:#111926;border:1px solid #26303f;margin-bottom:5px;font-size:12px' });
      d.appendChild(G.el('span', { text: G.VITRI_THEO_ID[p.vt].tat, style: 'color:#8b98a9;width:26px' }));
      d.appendChild(G.el('b', { text: p.ten, style: 'width:60px' }));
      if (i < lo) {
        var ur = null, ssr = null;
        for (var k in p.tt) { if (p.tt[k] === 'UR') ur = k; if (p.tt[k] === 'SSR') ssr = k; }
        d.appendChild(G.el('span', { html: 'tủ: <b style="color:#ff8fb0">' + (ur ? G.TUONG_THEO_ID[ur].ten : '?') +
          '</b>  ·  hay dùng: <span style="color:#ffd76e">' + (ssr ? G.TUONG_THEO_ID[ssr].ten : '?') + '</span>' }));
        d.appendChild(G.el('span', { text: '· ' + (G.CHAT[p.chat[0]] || {}).ten, style: 'color:#6fc4f0;margin-left:auto' }));
      } else {
        d.appendChild(G.el('span', { text: 'chưa đọc được gì', style: 'color:#5a6675' }));
      }
      b.appendChild(d);
    });
    n.appendChild(b);

    return G.hop({ dau: 'Báo cáo trước trận', node: n, nut: [{ chu: 'Vào cấm chọn ➜', chinh: true }] });
  }

  /* ══════════ chạy một giải ══════════ */
  G.chayGiai = function (ca, giai) {
    var doiMay = taoDoiMay(ca, giai);
    var soVan = giai.the === 'Bo5' ? 5 : giai.the === 'Bo3' ? 3 : 1;
    var canThang = Math.ceil(soVan / 2);
    var thangTa = 0, thangDich = 0;
    var daDung = { ta: [], dich: [] };     /* luật Không Lặp: tướng đã dùng ở ván trước */

    return baoCao(ca, doiMay, giai).then(function () { return vanTiep(); });

    function vanTiep() {
      return G.moDraft(ca, doiMay, giai, daDung, thangTa, thangDich, soVan)
        .then(function (pick) {
          return G.moChienThuat(ca, doiMay, pick, giai).then(function (ct) {
            ca.chienThuat = ct;
            var cau = {
              ta: cauHinhTa(ca, giai, pick),
              dich: cauHinhDich(doiMay, pick, giai),
              nhip: giai.nhip
            };
            cau.ta.chienThuat = ct;
            var tr = G.taoTran(cau, (ca.rng.hat() ^ (thangTa * 977 + thangDich * 331)) & 0x7fffffff);
            return new Promise(function (xong) {
              G.moManTran(tr, function (kq) {
                if (kq.thang === 'xanh') thangTa++; else thangDich++;
                ['ta', 'dich'].forEach(function (ben) {
                  var p = ben === 'ta' ? pick.ta : pick.dich;
                  for (var vt in p) daDung[ben].push(p[vt]);
                });
                /* thông thạo nhích lên sau mỗi ván (DESIGN.md §3.4) */
                ca.tt.forEach(function (id) {
                  var g = G.TUYENTHU_THEO_ID[id];
                  var tuongId = pick.ta[g.vt];
                  var b = G.coTT(id);
                  if (!b || !tuongId) return;
                  b.tt = b.tt || {};
                  var hienTai = G.thongThao(b, tuongId);
                  b.diem = b.diem || {};
                  b.diem[tuongId] = (b.diem[tuongId] || 0) + (kq.thang === 'xanh' ? 1 : 0.5);
                  var thang = { N: 4, R: 7, SR: 11, SSR: 16 };
                  var ke = { N: 'R', R: 'SR', SR: 'SSR', SSR: 'UR' };
                  if (thang[hienTai] && b.diem[tuongId] >= thang[hienTai]) {
                    b.tt[tuongId] = ke[hienTai];
                    b.diem[tuongId] = 0;
                  }
                });
                G.luu();
                xong();
              });
            });
          });
        })
        .then(function () {
          if (thangTa >= canThang || thangDich >= canThang) return ketGiai();
          return G.bangLon(thangTa + ' — ' + thangDich, 'ván tiếp theo', 1300).then(vanTiep);
        });
    }

    function ketGiai() {
      var thang = thangTa > thangDich;
      ca.thanhTich.push({ id: giai.id, ten: giai.ten, thang: thang, doi: doiMay.ten,
        ti: thangTa + '-' + thangDich });
      if (G.ghiGiaiCuaTa) { try { G.ghiGiaiCuaTa(giai, doiMay, thangTa, thangDich); } catch (e) {} }
      if (thang) {
        G.S.clb.xu += giai.thuong.xu;
        G.S.clb.fan += giai.thuong.fan;
      } else if (giai.muc === 'thang') {
        if (ca.veCuu > 0) {
          return G.hop({ dau: 'Thua rồi', html:
            'Đội thua <b>' + giai.ten + '</b> (' + thangTa + '-' + thangDich + ').<br><br>' +
            'Còn <b>' + ca.veCuu + ' vé cứu</b> — dùng để đá lại giải này từ đầu.',
            nut: [{ chu: 'Dùng vé cứu, đá lại', chinh: true, gt: 1 }, { chu: 'Chấp nhận thua', do: true, gt: 0 }] })
            .then(function (v) {
              if (v) {
                ca.veCuu--;
                ca.thanhTich.pop();
                thangTa = 0; thangDich = 0; daDung = { ta: [], dich: [] };
                return vanTiep();
              }
              ca.dut = true;
              return ketMan(thang);
            });
        }
        ca.dut = true;
      }
      return ketMan(thang);
    }

    function ketMan(thang) {
      G.luu();
      return G.bangLon(thang ? 'VÔ ĐỊCH ' + giai.ten.toUpperCase() : 'DỪNG BƯỚC',
        thangTa + ' — ' + thangDich + ' trước ' + doiMay.ten, 1800)
        .then(function () {
          if (thang) {
            G.phaoHoa(70);
            return G.hop({ dau: 'Thưởng', html:
              '<b style="color:#f2c94c">+' + G.so(giai.thuong.xu) + ' xu</b><br>' +
              '<b style="color:#ff9ec4">+' + G.so(giai.thuong.fan) + ' danh tiếng</b>' });
          }
        });
    }
  };

  /* cửa sau cho bộ đo `_tools/tileThang.js`: muốn biết giải nào dễ, giải nào khó thì
     phải dựng được đội máy và cấu hình trận y như lúc chơi thật, không phải dựng lại một bản gần
     giống rồi đo nhầm. Chỉ đọc, không sửa gì. */
  G._thu = { taoDoiMay: taoDoiMay, cauHinhTa: cauHinhTa, cauHinhDich: cauHinhDich };

})(window);
