/* ui-draft.js — màn cấm/chọn tướng và màn chiến thuật.

   Khác Teamfight Manager 2 một điểm quan trọng: ở đây vị trí của tuyển thủ là KHOÁ CỨNG, nên
   mỗi lượt chọn là chọn tướng CHO MỘT VỊ TRÍ cụ thể, và bảng thông thạo (N→UR) của chính người
   sẽ cầm con đó hiện ngay dưới — trên điện thoại không có chỗ cho tooltip rê chuột, thông tin
   phải nằm sẵn trên màn (DESIGN.md §8.3).
*/
(function (G) {
  'use strict';

  var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];

  /* thứ tự lượt: 4 cấm xen kẽ, rồi 10 chọn xen kẽ theo vị trí */
  function dungLuot() {
    var l = [];
    l.push({ loai: 'cam', ben: 'ta' }, { loai: 'cam', ben: 'dich' },
           { loai: 'cam', ben: 'ta' }, { loai: 'cam', ben: 'dich' });
    /* chọn: ta trước ở vị trí 1, rồi đan xen — đội đi sau được chọn phản */
    var thuTu = [['ta', 0], ['dich', 0], ['dich', 1], ['ta', 1], ['ta', 2], ['dich', 2],
                 ['dich', 3], ['ta', 3], ['ta', 4], ['dich', 4]];
    thuTu.forEach(function (x) { l.push({ loai: 'chon', ben: x[0], vt: VT[x[1]] }); });
    return l;
  }

  G.moDraft = function (ca, doiMay, giai, daDung, thangTa, thangDich, soVan) {
    return new Promise(function (xong) {
      var luot = dungLuot();
      var i = 0;
      var cam = [];                       /* tướng bị cấm ván này */
      var pick = { ta: {}, dich: {} };
      var dangXem = null;
      var khoaLap = giai.bac >= 3;        /* từ chung kết thế giới trở lên: luật Không Lặp */

      var m = G.xoa(G.$('#man-draft'));
      var tren = G.el('div.dr-tren');
      tren.appendChild(G.el('button.nut-nho', { text: 'Giao cho trợ lý', onclick: function () {
        while (i < luot.length) { tuDong(); }
        ketThuc();
      } }));
      tren.appendChild(G.el('div.dr-pha#dr-pha', { text: '' }));
      tren.appendChild(G.el('div.dr-huong#dr-huong', { text: '' }));
      m.appendChild(tren);

      var than = G.el('div.dr-than');
      var cotTa = G.el('div.dr-cot#dr-cot-ta');
      var giua = G.el('div.dr-giua');
      giua.appendChild(G.el('div.dr-luoi#dr-luoi'));
      giua.appendChild(G.el('div.dr-chitiet#dr-chitiet'));
      var cotDich = G.el('div.dr-cot.phai#dr-cot-dich');
      than.appendChild(cotTa); than.appendChild(giua); than.appendChild(cotDich);
      m.appendChild(than);

      var day = G.el('div.dr-day');
      day.appendChild(G.el('span', { text: G.S.clb.ten, style: 'color:#3ddc97;font-weight:800' }));
      day.appendChild(G.el('span#dr-ti', { text: thangTa + ' — ' + thangDich, style: 'font-weight:800' }));
      day.appendChild(G.el('span', { text: giai.ten + ' · ' + giai.the + (khoaLap ? ' · luật Không Lặp' : '') ,
        style: 'color:#8b98a9;font-size:12px' }));
      day.appendChild(G.el('span', { text: doiMay.ten, style: 'color:#e5484d;font-weight:800' }));
      m.appendChild(day);

      G.hienMan('man-draft');
      veTatCa();
      if (G.day) G.day('draft');

      /* ── vẽ ── */
      function veTatCa() { veTren(); veCot(); veLuoi(); veChiTiet(); }

      function veTren() {
        var l = luot[i];
        if (!l) return;
        G.$('#dr-pha').textContent = l.loai === 'cam'
          ? 'LƯỢT CẤM ' + (i + 1) + '/4'
          : 'LƯỢT CHỌN — ' + G.VITRI_THEO_ID[l.vt].ten;
        G.$('#dr-huong').textContent = l.ben === 'ta'
          ? (l.loai === 'cam' ? 'Chạm một tướng để cấm' : 'Chạm một tướng để giao cho ' + tenNguoi(l.vt))
          : 'Đối thủ đang chọn…';
        G.$('#man-draft').className = 'man ' + (l.ben === 'ta' ? 'luot-ta' : 'luot-dich');
      }

      function tenNguoi(vt) {
        var id = ca.tt.filter(function (x) { return G.TUYENTHU_THEO_ID[x].vt === vt; })[0];
        return id ? G.TUYENTHU_THEO_ID[id].biet : vt;
      }

      function veCot() {
        [['ta', '#dr-cot-ta'], ['dich', '#dr-cot-dich']].forEach(function (x) {
          var e = G.xoa(G.$(x[1]));
          VT.forEach(function (vt) {
            var o = G.el('div.dr-o');
            var ten = x[0] === 'ta' ? tenNguoi(vt)
              : (doiMay.nguoi.filter(function (p) { return p.vt === vt; })[0] || {}).ten;
            o.appendChild(G.el('div.dr-o-vt', { text: G.VITRI_THEO_ID[vt].tat }));
            o.appendChild(G.el('div.dr-o-ten', { text: ten }));
            var t = pick[x[0]][vt];
            o.appendChild(G.el('div.dr-o-tuong', { text: t ? G.TUONG_THEO_ID[t].ten : '—',
              style: t ? '' : 'color:#5a6675' }));
            if (t && x[0] === 'ta') {
              var id = ca.tt.filter(function (y) { return G.TUYENTHU_THEO_ID[y].vt === vt; })[0];
              var b = G.coTT(id) || { id: id };
              var bac = G.thongThao(b, t);
              o.appendChild(G.el('div.dr-o-tt', { text: bac, style: 'color:' + G.TT_THEO_ID[bac].mau }));
            }
            e.appendChild(o);
          });
        });
      }

      function veLuoi() {
        var e = G.xoa(G.$('#dr-luoi'));
        var l = luot[i];
        VT.forEach(function (vt) {
          var nhom = G.el('div.dr-nhom');
          nhom.appendChild(G.el('div.dr-nhom-ten', { text: G.VITRI_THEO_ID[vt].ten }));
          var hang = G.el('div.dr-hang');
          G.tuongTheoViTri(vt).forEach(function (t) {
            var biCam = cam.indexOf(t.id) >= 0;
            var daLay = pick.ta[t.vt] === t.id || pick.dich[t.vt] === t.id;
            var lapLai = khoaLap && (daDung.ta.indexOf(t.id) >= 0 || daDung.dich.indexOf(t.id) >= 0);
            var o = G.el('div.dr-t' + (biCam ? '.cam' : '') + (daLay ? '.lay' : '') +
              (lapLai ? '.lap' : '') + (dangXem === t.id ? '.xem' : ''));
            o.appendChild(G.el('div.dr-t-ten', { text: t.ten }));
            o.appendChild(G.el('div.dr-t-lop', { text: G.LOP_TEN[t.lop] }));
            if (biCam) o.appendChild(G.el('div.dr-t-dau', { text: '⊘' }));
            if (lapLai && !biCam && !daLay) o.appendChild(G.el('div.dr-t-so', { text: '↺' }));
            o.addEventListener('click', function () {
              dangXem = t.id; veLuoi(); veChiTiet();
              if (!l || l.ben !== 'ta') return;
              if (biCam || daLay || lapLai) return;
              if (l.loai === 'chon' && t.vt !== l.vt) return;
              chonTuong(t.id);
            });
            hang.appendChild(o);
          });
          nhom.appendChild(hang);
          e.appendChild(nhom);
        });
      }

      function veChiTiet() {
        var e = G.xoa(G.$('#dr-chitiet'));
        if (!dangXem) {
          e.appendChild(G.el('div', { text: 'Chạm một tướng để xem chỉ số, ba kỹ năng, và mức thông thạo của người sẽ cầm nó.',
            style: 'color:#8b98a9;font-size:12.5px;padding:10px' }));
          return;
        }
        var t = G.TUONG_THEO_ID[dangXem];
        var c1 = G.tuongOCap(t, 1), c12 = G.tuongOCap(t, 12);

        var dau = G.el('div.ct-dau');
        dau.appendChild(G.el('b', { text: t.ten }));
        dau.appendChild(G.el('span', { text: G.LOP_TEN[t.lop] + ' · ' + G.VITRI_THEO_ID[t.vt].ten,
          style: 'color:#8b98a9;font-size:12px' }));
        e.appendChild(dau);

        var bang = G.el('div.ct-bang');
        [['Đánh', c1.atk, c12.atk], ['Phép', c1.ap, c12.ap], ['Máu', c1.hp, c12.hp],
         ['Giáp', c1.giap, c12.giap], ['Kháng', c1.khang, c12.khang], ['Tầm', c1.tam, c12.tam]]
          .forEach(function (r) {
            var d = G.el('div.ct-o');
            d.appendChild(G.el('span', { text: r[0] }));
            d.appendChild(G.el('b', { text: Math.round(r[1]) + ' → ' + Math.round(r[2]) }));
            bang.appendChild(d);
          });
        e.appendChild(bang);

        [t.kn.noi, t.kn.chieu, t.kn.cuoi].forEach(function (k) {
          var d = G.el('div.ct-kn');
          var h = G.el('div.ct-kn-dau');
          h.appendChild(G.el('b', { text: k.ten }));
          h.appendChild(G.el('span', { text: k.loai === 'noi' ? 'NỘI TẠI' : (k.loai === 'cuoi' ? 'CHIÊU CUỐI · ' + k.hoi + 's' : 'CHIÊU · ' + k.hoi + 's'),
            style: 'color:' + (k.loai === 'cuoi' ? '#ffd76e' : k.loai === 'noi' ? '#5fe0b0' : '#6fc4f0') }));
          d.appendChild(h);
          d.appendChild(G.el('div.ct-kn-mo', { text: k.mo }));
          e.appendChild(d);
        });

        /* thông thạo của cả năm người mình — điểm khác biệt so với bản gốc */
        var tt = G.el('div.ct-tt');
        tt.appendChild(G.el('div.ct-tt-nhan', { text: 'Người của mình cầm con này:' }));
        var co = false;
        ca.tt.forEach(function (id) {
          var g = G.TUYENTHU_THEO_ID[id];
          if (g.vt !== t.vt) return;
          co = true;
          var b = G.coTT(id) || { id: id };
          var bac = G.thongThao(b, t.id);
          var d = G.el('div.ct-tt-dong');
          d.appendChild(G.el('span', { text: g.biet }));
          d.appendChild(G.el('b', { text: bac, style: 'color:' + G.TT_THEO_ID[bac].mau }));
          d.appendChild(G.el('span', { text: '×' + G.TT_THEO_ID[bac].heso.toFixed(2) + ' chỉ số',
            style: 'color:#8b98a9;font-size:11px' }));
          tt.appendChild(d);
        });
        if (!co) tt.appendChild(G.el('div', { text: 'Không ai của mình đá vị trí này.', style: 'color:#8b98a9;font-size:12px' }));

        /* ai bên kia hay dùng con này */
        doiMay.nguoi.forEach(function (p) {
          if (p.vt !== t.vt || !p.tt[t.id]) return;
          tt.appendChild(G.el('div.ct-tt-dong', { style: 'opacity:.85' , html:
            '<span style="color:#e5484d">' + p.ten + ' (đối thủ)</span><b style="color:' +
            G.TT_THEO_ID[p.tt[t.id]].mau + '">' + p.tt[t.id] + '</b><span></span>' }));
        });
        e.appendChild(tt);
      }

      /* ── luồng lượt ── */
      function chonTuong(id) {
        var l = luot[i];
        if (l.loai === 'cam') cam.push(id);
        else pick[l.ben][l.vt] = id;
        i++;
        dangXem = null;
        veTatCa();
        setTimeout(chayMay, 260);
      }

      function chayMay() {
        var buoc = 0;
        while (i < luot.length && luot[i].ben === 'dich' && buoc++ < 20) {
          tuDong();
        }
        veTatCa();
        if (i >= luot.length) return ketThuc();
        /* nếu tới lượt ta thì dừng chờ chạm */
      }

      /** máy (và nút "giao cho trợ lý") tự đi một lượt */
      function tuDong() {
        var l = luot[i];
        if (!l) return;
        var rng = ca.rng;

        if (l.loai === 'cam') {
          var ung = [];
          if (l.ben === 'dich') {
            /* máy cấm tướng tủ của người chơi — đúng lời khuyên "cấm theo người, không theo tướng" */
            ca.tt.forEach(function (id) {
              var b = G.coTT(id); if (!b) return;
              G.tuongTheoViTri(G.TUYENTHU_THEO_ID[id].vt).forEach(function (t) {
                var bac = G.thongThao(b, t.id);
                if ((bac === 'UR' || bac === 'SSR') && cam.indexOf(t.id) < 0) ung.push(t.id);
              });
            });
          } else {
            doiMay.nguoi.forEach(function (p) {
              for (var k in p.tt) if ((p.tt[k] === 'UR' || p.tt[k] === 'SSR') && cam.indexOf(k) < 0) ung.push(k);
            });
          }
          if (!ung.length) {
            var conLai = G.TUONG.filter(function (t) { return cam.indexOf(t.id) < 0; });
            ung = [rng.chon(conLai).id];
          }
          cam.push(rng.chon(ung));
          i++;
          return;
        }

        /* chọn tướng: lấy con thông thạo cao nhất còn dùng được */
        var vt = l.vt;
        var ds = G.tuongTheoViTri(vt).filter(function (t) {
          if (cam.indexOf(t.id) >= 0) return false;
          if (pick.ta[vt] === t.id || pick.dich[vt] === t.id) return false;
          if (khoaLap && (daDung.ta.indexOf(t.id) >= 0 || daDung.dich.indexOf(t.id) >= 0)) return false;
          return true;
        });
        if (!ds.length) { i++; return; }

        var diem = ds.map(function (t) {
          var d = 1;
          if (l.ben === 'dich') {
            var p = doiMay.nguoi.filter(function (x) { return x.vt === vt; })[0];
            var bac = (p && p.tt[t.id]) || 'N';
            d = G.TT_THEO_ID[bac].heso;
            if (doiMay.goc.tuong.indexOf(t.id) >= 0) d += 0.15;
          } else {
            var id2 = ca.tt.filter(function (x) { return G.TUYENTHU_THEO_ID[x].vt === vt; })[0];
            var b2 = G.coTT(id2) || { id: id2 };
            d = G.TT_THEO_ID[G.thongThao(b2, t.id)].heso;
          }
          return { t: t, d: d + rng() * 0.06 };
        });
        diem.sort(function (a, b) { return b.d - a.d; });
        pick[l.ben][vt] = diem[0].t.id;
        i++;
      }

      function ketThuc() {
        /* phòng hờ: vị trí nào chưa có tướng thì lấy đại một con còn trống */
        VT.forEach(function (vt) {
          ['ta', 'dich'].forEach(function (ben) {
            if (pick[ben][vt]) return;
            var ds = G.tuongTheoViTri(vt).filter(function (t) {
              return cam.indexOf(t.id) < 0 && pick.ta[vt] !== t.id && pick.dich[vt] !== t.id;
            });
            pick[ben][vt] = (ds[0] || G.tuongTheoViTri(vt)[0]).id;
          });
        });
        xong(pick);
      }

      /* nếu lượt đầu là của máy thì chạy luôn */
      if (luot[0].ben === 'dich') setTimeout(chayMay, 400);
    });
  };

  /* ══════════════════ MÀN CHIẾN THUẬT ══════════════════ */
  /* ══════════════════ CHIẾN THUẬT ══════════════════

     Bản đầu có bảy nhóm × hai ba lựa chọn, và **bốn trong bảy nhóm không được bộ mô phỏng đọc**
     (`sim.js` chỉ dùng `ct.rong`, `ct.rung`, `ct.mucTieu`) — tức là bốn hàng nút bấm cho vui.
     Chủ dự án chốt: làm gọn kiểu Uma, chỉ chọn **lối chạy**.

     Uma có bốn lối chạy Front / Pace / Late / End, và mỗi ngựa có **năng khiếu riêng cho từng
     lối** hạng G→S. Ghế Nóng đã có sẵn đúng bốn thế trận ấy trong `nk.the` của mỗi huấn luyện
     viên (DESIGN.md §2.3) mà trước giờ chỉ dùng để lấy hạng CAO NHẤT một cách tự động. Giờ người
     chơi chọn, và **năng khiếu của đúng lối được chọn** mới là hệ số áp vào trận — hệt Uma.

     Một lối chọn ra ba thiết lập mà bộ mô phỏng thật sự đọc, cộng thêm hệ số theo giai đoạn
     trận qua `heso.ds` (`hesoDoi` trong sim.js đọc loai 'sat'/'chiu' theo pha dau/giua/cuoi). */
  var THE_TRAN = [
    { id: 'baodau', ten: 'Bạo Đầu', uma: 'Front',
      mo: 'Dồn hết vào mười phút đầu: đi kèo sớm, tranh mọi con quái lớn, thấy khe là lao.',
      duoc: 'Mạnh nhất trước phút 10 (+10% sát thương giai đoạn đầu).',
      mat: 'Đuối rõ nếu trận kéo dài (−8% sát thương giai đoạn cuối).',
      ct: { rong: 'luon', rung: 'gank', mucTieu: 'lao' },
      heso: [{ loai: 'sat', pha: 'dau', muc: 0.10 }, { loai: 'sat', pha: 'cuoi', muc: -0.08 }],
      chat: ['lao', 'gank', 'fight', 'solo'] },

    { id: 'bamnhip', ten: 'Bám Nhịp', uma: 'Pace',
      mo: 'Giữ thế cân bằng, ăn từng mục tiêu nhỏ, không nhường cũng không cố.',
      duoc: 'Không có giai đoạn nào yếu (+6% chịu đòn suốt trận).',
      mat: 'Cũng không có giai đoạn nào mạnh vượt trội.',
      ct: { rong: 'tuy', rung: 'farm', mucTieu: 'poke' },
      heso: [{ loai: 'chiu', pha: 'luon', muc: 0.06 }],
      chat: ['mt', 'lead', 'poke', 'farm'] },

    { id: 'nuoimuon', ten: 'Nuôi Muộn', uma: 'Late',
      mo: 'Chịu trận nửa đầu, đổi tài nguyên lấy farm, bung từ phút 25.',
      duoc: 'Chịu đòn tốt lúc đầu (+9%) và đánh mạnh về cuối (+12%).',
      mat: 'Nhường quái lớn sớm, dễ bị đẩy trụ trước phút 15.',
      ct: { rong: 'nhuong', rung: 'farm', mucTieu: 'poke' },
      heso: [{ loai: 'chiu', pha: 'dau', muc: 0.09 }, { loai: 'sat', pha: 'cuoi', muc: 0.12 }],
      chat: ['farm', 'thu', 'le', 'poke'] },

    { id: 'bungcuoi', ten: 'Bùng Cuối', uma: 'End',
      mo: 'Nhường hẳn nửa đầu, dồn tất cả vào giao tranh tổng cuối trận.',
      duoc: 'Sát thương giai đoạn cuối tăng vọt (+18%).',
      mat: 'Yếu rõ nửa đầu (−7% sát thương giai đoạn đầu). Ăn to hoặc thua đậm.',
      ct: { rong: 'nhuong', rung: 'farm', mucTieu: 'poke' },
      heso: [{ loai: 'sat', pha: 'cuoi', muc: 0.18 }, { loai: 'sat', pha: 'dau', muc: -0.07 }],
      chat: ['fight', 'thu', 'mt', 'lead'] }
  ];
  G.THE_TRAN = THE_TRAN;
  G.theTheoId = function (id) {
    for (var i = 0; i < THE_TRAN.length; i++) if (THE_TRAN[i].id === id) return THE_TRAN[i];
    return THE_TRAN[1];
  };

  /** đổi một thế trận thành thiết lập mà sim.js đọc được */
  G.chotChienThuat = function (id) {
    var t = G.theTheoId(id);
    return { the: t.id, rong: t.ct.rong, rung: t.ct.rung, mucTieu: t.ct.mucTieu };
  };

  G.moChienThuat = function (ca, doiMay, pick, giai) {
    return new Promise(function (xong) {
      /* mặc định: lối mà huấn luyện viên có năng khiếu cao nhất */
      var chon = (ca.chienThuat && ca.chienThuat.the) || null;
      if (!chon) {
        var caoNhat = -1;
        THE_TRAN.forEach(function (t) {
          var k = G.THU_TU_NK.indexOf(ca.nk.the[t.id] || 'C');
          if (k > caoNhat) { caoNhat = k; chon = t.id; }
        });
      }

      var m = G.xoa(G.$('#man-chienthuat'));
      m.appendChild(G.el('div.ct-tren', {
        html: '<b>Chọn thế trận</b> <span style="color:#8b98a9;font-size:12px">— một lựa chọn, ' +
          'giống lối chạy của Uma. Năng khiếu của huấn luyện viên cho đúng lối này là hệ số áp ' +
          'vào cả đội, và người có cái tôi cao vẫn chơi theo chất của mình.</span>'
      }));

      var than = G.el('div.ct-than');
      var luoi = G.el('div.ct-the#ct-the');
      than.appendChild(luoi);

      var phai = G.el('div.ct-phai');
      phai.appendChild(G.el('div.ct-nhom-ten', { text: 'Đối đầu' }));
      VT.forEach(function (vt) {
        var id = ca.tt.filter(function (x) { return G.TUYENTHU_THEO_ID[x].vt === vt; })[0];
        var g = G.TUYENTHU_THEO_ID[id];
        var p = doiMay.nguoi.filter(function (x) { return x.vt === vt; })[0];
        var d = G.el('div.ct-mu');
        d.appendChild(G.el('span', { text: G.VITRI_THEO_ID[vt].tat, style: 'color:#8b98a9;width:24px' }));
        d.appendChild(G.el('b', { text: g.biet }));
        d.appendChild(G.el('span', { text: G.TUONG_THEO_ID[pick.ta[vt]].ten, style: 'color:#3ddc97' }));
        d.appendChild(G.el('span', { text: 'vs', style: 'color:#5a6675' }));
        d.appendChild(G.el('span', { text: G.TUONG_THEO_ID[pick.dich[vt]].ten, style: 'color:#e5484d' }));
        d.appendChild(G.el('b', { text: p.ten }));
        phai.appendChild(d);
      });
      phai.appendChild(G.el('div.ct-nhom-ten', { text: 'Trang bị', style: 'margin-top:10px' }));
      phai.appendChild(G.el('div', {
        text: 'Không ai chọn đồ hộ. Trong trận, mỗi người tự nhìn đội địch đánh bằng gì, ' +
          'mình đang thắng hay bị dí, rồi mua. NÃO của huấn luyện viên quyết định họ đọc trận chuẩn tới đâu.',
        style: 'font-size:11.5px;color:#8b98a9;line-height:1.6'
      }));
      phai.appendChild(G.el('div.ct-nhom-ten', { text: 'Đối thủ ưa lối', style: 'margin-top:10px' }));
      phai.appendChild(G.el('div', {
        html: '<b style="color:#e5484d">' + doiMay.ten + '</b> đá <b>' +
          (G.TEN_THE[doiMay.goc.the] || doiMay.goc.the) + '</b>. ' + doiMay.goc.tieu,
        style: 'font-size:11.5px;color:#8b98a9;line-height:1.6'
      }));
      than.appendChild(phai);
      m.appendChild(than);

      var day = G.el('div.ct-day');
      day.appendChild(G.el('button.nut', { text: 'Giao cho trợ lý', onclick: function () {
        /* trợ lý luôn chọn lối mà huấn luyện viên khoẻ nhất */
        var cao = -1, id = 'bamnhip';
        THE_TRAN.forEach(function (t) {
          var k = G.THU_TU_NK.indexOf(ca.nk.the[t.id] || 'C');
          if (k > cao) { cao = k; id = t.id; }
        });
        xong(G.chotChienThuat(id));
      } }));
      day.appendChild(G.el('button.nut.chinh', { text: 'BẮT ĐẦU TRẬN ➜',
        onclick: function () { xong(G.chotChienThuat(chon)); } }));
      m.appendChild(day);

      G.hienMan('man-chienthuat');
      ve();

      function ve() {
        var e = G.xoa(G.$('#ct-the'));
        THE_TRAN.forEach(function (t) {
          var hang = ca.nk.the[t.id] || 'C';
          var he = G.hesoNangKhieu(hang);
          var khop = ca.tt.filter(function (id) {
            var g = G.TUYENTHU_THEO_ID[id];
            return g.chat.some(function (c) { return t.chat.indexOf(c) >= 0; });
          });

          var o = G.el('div.ct-o-the' + (chon === t.id ? '.chon' : ''));
          var dau = G.el('div.ct-the-dau');
          dau.appendChild(G.el('b', { text: t.ten }));
          dau.appendChild(G.el('span.ct-the-uma', { text: t.uma }));
          dau.appendChild(G.el('span.ct-the-nk', {
            text: hang + '  ×' + he.toFixed(2),
            style: 'color:' + mauHang(hang)
          }));
          o.appendChild(dau);

          o.appendChild(G.el('div.ct-the-mo', { text: t.mo }));
          o.appendChild(G.el('div.ct-the-duoc', { text: '＋ ' + t.duoc }));
          o.appendChild(G.el('div.ct-the-mat', { text: '－ ' + t.mat }));

          var kh = G.el('div.ct-the-chat');
          kh.appendChild(G.el('span', {
            text: khop.length + '/5 người hợp chất',
            style: 'color:' + (khop.length >= 3 ? '#3ddc97' : khop.length >= 2 ? '#f2c94c' : '#e5484d')
          }));
          khop.forEach(function (id) {
            kh.appendChild(G.el('em', { text: G.TUYENTHU_THEO_ID[id].biet }));
          });
          o.appendChild(kh);

          o.addEventListener('click', function () { chon = t.id; G.tieng('chon'); ve(); });
          e.appendChild(o);
        });
      }

      function mauHang(h) {
        return h === 'S' ? '#ffd76e' : h === 'A' ? '#3ddc97' : h === 'B' ? '#7fd6ff'
          : h === 'C' ? '#c8d3e0' : h === 'D' ? '#f2903c' : '#e5484d';
      }
    });
  };

})(window);
