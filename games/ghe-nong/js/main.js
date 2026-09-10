/* main.js — khởi động, phóng khung 1280×720 cho vừa màn, và điều phối màn hình. */
(function (G) {
  'use strict';

  /* ── phóng khung ── */
  function chinhCo() {
    var k = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    var kh = G.$('#khung');
    kh.style.transform = 'scale(' + k + ')';
    /* màn dọc quá hẹp thì nhắc xoay, nhưng vẫn cho chơi */
    var doc = window.innerHeight > window.innerWidth * 1.05;
    var nh = G.$('#nhac-xoay');
    if (doc && !G._boNhac) nh.hidden = false; else nh.hidden = true;
  }
  window.addEventListener('resize', chinhCo);
  window.addEventListener('orientationchange', function () { setTimeout(chinhCo, 120); });

  /* ── chuyển màn ── */
  G.hienMan = function (id) {
    G.$$('.man').forEach(function (m) { m.hidden = m.id !== id; });
  };

  /* ══════════ giải đấu ══════════
     Nếu bộ ban/pick + mô phỏng đã nạp thì đưa sang đó; chưa có thì tính kết quả gọn
     để vòng huấn luyện vẫn chơi thông từ đầu tới cuối. */
  G.vaoGiai = function (ca, giai) {
    if (G.chayGiai) return G.chayGiai(ca, giai);

    return new Promise(function (xong) {
      var sucTa = G.sucManhDoi(ca);
      var nhom = G.NHOM_DOI[giai.doi] || G.NHOM_DOI.ai_low;
      var doi = G.DOI_THEO_ID[nhom[ca.rng.nguyen(nhom.length)]];
      var cheech = (sucTa - doi.suc) / 300;
      var ti = G.kep(0.5 + cheech * 0.32, 0.05, 0.95);
      var thang = ca.rng.duoc(ti);

      ca.thanhTich.push({ id: giai.id, ten: giai.ten, thang: thang, doi: doi.ten });
      if (thang) {
        G.S.clb.xu += giai.thuong.xu;
        G.S.clb.fan += giai.thuong.fan;
      } else if (giai.muc === 'thang') {
        ca.dut = true;
      }
      G.luu();

      G.bangLon(thang ? 'THẮNG!' : 'THUA', giai.ten + ' — ' + doi.ten, 1600).then(function () {
        if (thang) G.phaoHoa(60);
        xong();
      });
    });
  };

  /** sức mạnh đội quy đổi từ chỉ số HLV + thông thạo + năng khiếu (dùng cho kết quả gọn) */
  G.sucManhDoi = function (ca, giai) {
    var tb = 0, i;
    for (i = 0; i < 5; i++) tb += ca.chiso[i];
    tb /= 5;

    var kn = 1;
    ca.kyNang.forEach(function (id) {
      var k = G.knTatCa(id); if (k) kn += k.hieu.muc * 0.35;
    });
    var goc = G.HLV_THEO_ID[ca.hlvId];
    var rieng = G.KN_RIENG[goc.kn];
    if (rieng) kn += rieng.hieu.muc * 0.4;

    var he = 1;
    if (giai) {
      he *= G.hesoNangKhieu(ca.nk.san[giai.sanDau] || 'C');
      he *= G.hesoNangKhieu(ca.nk.nhip[giai.nhip] || 'C');
    }
    /* tuyển thủ: sao vị trí và cấp thẻ */
    var tt = 0;
    ca.tt.forEach(function (id) {
      var g = G.TUYENTHU_THEO_ID[id]; if (!g) return;
      var b = G.coTT(id) || { cap: 1 };
      tt += g.vtSao * 12 + b.cap * 1.2;
    });

    return tb * kn * he + tt;
  };

  /* ══════════ kết mùa ══════════ */
  G.ketThucMua = function (ca) {
    var thang = ca.thanhTich.filter(function (t) { return t.thang; }).length;
    var vodich = ca.thanhTich.length && ca.thanhTich[ca.thanhTich.length - 1].id === 'w4' &&
      ca.thanhTich[ca.thanhTich.length - 1].thang;

    var n = G.el('div');
    n.appendChild(G.el('div', { text: vodich ? 'VÔ ĐỊCH THẾ GIỚI' : (ca.dut ? 'Mùa dừng giữa chừng' : 'Hết mùa'),
      style: 'font-size:20px;font-weight:800;margin-bottom:8px;color:' + (vodich ? '#ffd76e' : '#e6edf5') }));

    var b = G.el('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0' });
    for (var i = 0; i < 5; i++) {
      var o = G.el('div', { style: 'text-align:center;padding:7px;border-radius:9px;background:#111926;border:1px solid #26303f' });
      o.appendChild(G.el('div', { text: G.TEN_CHISO[i], style: 'font-size:10px;color:#8b98a9' }));
      o.appendChild(G.el('div', { text: String(ca.chiso[i]), style: 'font-size:17px;font-weight:800' }));
      o.appendChild(G.el('div', { text: G.hangChu(ca.chiso[i]), style: 'font-size:11px;color:#f2c94c' }));
      b.appendChild(o);
    }
    n.appendChild(b);

    n.appendChild(G.el('div', { text: 'Thắng ' + thang + '/' + ca.thanhTich.length + ' giải',
      style: 'color:#8b98a9;margin-bottom:8px' }));

    /* Kết toán bảng xếp hạng: mùa này ta đứng thứ mấy, ai vô địch quốc nội, ai đứng đầu thế giới */
    if (G.ketMuaBXH) {
      var kb = G.ketMuaBXH();
      if (kb) {
        var bx = G.el('div', { style: 'background:#111926;border:1px solid #26303f;border-radius:11px;padding:9px;margin:8px 0' });
        bx.appendChild(G.el('div', { text: 'BẢNG XẾP HẠNG CUỐI MÙA',
          style: 'font-size:10px;color:#8b98a9;letter-spacing:.08em;margin-bottom:6px' }));
        bx.appendChild(G.el('div', { html: 'Quốc nội: ta hạng <b style="color:#3ddc97">' + kb.ta.hang + '/' + kb.ta.tong +
          '</b> · vô địch <b>' + (kb.vn[0] ? kb.vn[0].ten : '?') + '</b>',
          style: 'font-size:12.5px;margin-bottom:3px' }));
        bx.appendChild(G.el('div', { html: 'Đứng đầu thế giới: <b>' + (kb.qt[0] ? kb.qt[0].ten : '?') + '</b>',
          style: 'font-size:12.5px;color:#8b98a9' }));
        n.appendChild(bx);
      }
    }

    var hs = G.ketCa(ca);
    n.appendChild(G.el('div', { text: 'Hồ sơ để lại cho đời sau:', style: 'font-size:12px;color:#8b98a9;margin-top:10px' }));
    var sp = G.el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap;margin-top:5px' });
    (hs.sparks || []).forEach(function (s) {
      var mau = s.mau === 'xanh' ? '#4a9df8' : s.mau === 'hong' ? '#ff8fb0' : s.mau === 'la' ? '#3ddc97' : '#c8d3e0';
      sp.appendChild(G.el('span', { text: (s.khoa || s.kn || '') + ' ' + '★'.repeat(s.sao),
        style: 'font-size:11px;padding:2px 7px;border-radius:5px;background:#0a1017;color:' + mau }));
    });
    n.appendChild(sp);

    if (vodich) G.phaoHoa(90);

    return G.hop({ dau: 'Kết mùa', node: n, nut: [{ chu: 'Về CLB', chinh: true }] })
      .then(function () { G.moManCLB('ca'); });
  };

  /** mở nhanh một màn theo hash — dùng khi dựng game và khi chụp ảnh kiểm giao diện */
  function moNhanh(h) {
    if (h === 'ca' || h === 'train') {
      var tt = G.S.khoTT.slice(0, 5).map(function (x) { return x.id; });
      var d = G.duDoiHinh(tt);
      if (!d.du) return;
      var ca = G.S.ca ? G.hoiSinhCa(G.S.ca) : G.moCa(G.S.khoHLV[0].id, tt, G.S.cuu.slice(0, 2));
      G.S.ca = G.luuCa(ca);
      G.moManCa(ca);
      return;
    }
    if (['gacha', 'hlv', 'tt', 'cuu', 'ky', 'bxh'].indexOf(h) >= 0) return G.moManCLB(h);

    /* #tran và #draft: dựng một ca giả rồi nhảy thẳng vào khâu thi đấu, để soi giao diện */
    if (h === 'tran' || h === 'draft' || h === 'giai') {
      var tt2 = G.S.khoTT.slice(0, 5).map(function (x) { return x.id; });
      if (!G.duDoiHinh(tt2).du) return;
      var ca2 = G.moCa(G.S.khoHLV[0].id, tt2, []);
      /* cho sẵn chỉ số để trận không phải toàn hạng G */
      ca2.chiso = [720, 640, 700, 600, 680];
      var giai2 = G.LICH[4].giai;
      if (h === 'giai') return G.chayGiai(ca2, giai2);
      if (h === 'tran') {
        /* vào thẳng một trận mẫu: bỏ qua báo cáo, cấm chọn, chiến thuật */
        var VT2 = ['tren', 'rung', 'giua', 'duoi', 'ho'];
        var lam = function (ten, mau, muc, lech) {
          return {
            ten: ten, mau: mau, heso: { ds: [] }, chienThuat: { rong: 'tuy', rung: 'gank', mucTieu: 'poke' },
            nguoi: VT2.map(function (vt, i) {
              var ds = G.tuongTheoViTri(vt);
              return { vt: vt, tuyenthuId: G.S.khoTT[i] && G.S.khoTT[i].id, tuongId: ds[(i + lech) % ds.length].id,
                tt: ['SSR', 'SR', 'UR', 'SR', 'R'][i], ten: G.TEN_MAY[i + lech * 5],
                chat: ['fight', 'farm'], ego: 45,
                cs: { co: muc, ben: muc, luc: muc, li: muc, nao: muc } };
            })
          };
        };
        var tr2 = G.taoTran({ ta: lam(G.S.clb.ten, '#3ddc97', 780, 0), dich: lam('Hổ Xám', '#e5484d', 700, 1), nhip: 'ngan' }, 42);
        /* #tran:600 → chạy sẵn 600 tick rồi mới mở màn, để chụp được trận đang giữa chừng */
        var boQua = parseInt((location.hash.split(':')[1] || '0'), 10);
        for (var q = 0; q < boQua && !tr2.xong; q++) G.tickTran(tr2);
        return G.moManTran(tr2, function () { G.moManCLB('ca'); });
      }
      if (h === 'draft') return G.moDraft(ca2, taoDichMau(ca2), giai2, { ta: [], dich: [] }, 0, 0, 3);
      /* #tran: bỏ qua cấm chọn, vào thẳng trận */
      return G.chayGiai(ca2, giai2);
    }
  }

  function taoDichMau(ca) {
    var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];
    return {
      goc: G.DOI_AI[4], ten: G.DOI_AI[4].ten, mau: G.DOI_AI[4].mau,
      nguoi: VT.map(function (vt, i) {
        var ds = G.tuongTheoViTri(vt), tt = {};
        tt[ds[0].id] = 'UR'; tt[ds[1].id] = 'SSR';
        return { vt: vt, ten: G.TEN_MAY[i], tt: tt, chat: ['fight'], ego: 50 };
      })
    };
  }
  G.moNhanh = moNhanh;

  /* ══════════ khởi động ══════════ */
  function chay() {
    chinhCo();
    G.$('#xoay-bo').addEventListener('click', function () { G._boNhac = true; chinhCo(); });

    G.taiSave();
    G.CAI.rung = !!G.S.cai.rung;
    if (G.taiArt) G.taiArt();
    if (G.tatTieng) G.tatTieng(G.S.cai.tieng === false);

    var t = G.$('#man-tai .tai-thanh i');
    var p = 0;
    var id = setInterval(function () {
      p += 14 + Math.random() * 22;
      t.style.width = Math.min(100, p) + '%';
      if (p >= 100) {
        clearInterval(id);
        setTimeout(function () {
          G.moManCLB('ca');
          /* #ca / #gacha / #tt … : mở thẳng một màn để soi giao diện lúc dựng game.
             Chỉ chạy khi có dấu # trên URL, người chơi bình thường không chạm tới. */
          var h = (location.hash || '').replace('#', '').split(':')[0];
          if (h) moNhanh(h);
        }, 260);
      }
    }, 90);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chay);
  else chay();

})(window);
