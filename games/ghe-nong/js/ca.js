/* ca.js — engine của một CA HUẤN LUYỆN (vai "career" của Uma).
   Không đụng gì tới DOM. Mọi thứ ở đây là số; phần vẽ nằm ở ui-ca.js.

   Vòng đời:
     G.moCa(hlvId, [5 tuyển thủ], [2 cựu HLV])  → tạo trạng thái ca
     G.raiNguoi(ca)                              → mỗi lượt rải tuyển thủ vào 5 sân
     G.xemTruoc(ca, sanIdx)                      → xem trước ăn được bao nhiêu, hỏng bao nhiêu %
     G.lamViec(ca, {loai:'tap', san:0})          → làm việc của lượt, trả về nhật ký
   Công thức chốt ở DESIGN.md §4.3 và §4.4.
*/
(function (G) {
  'use strict';

  var SAN = ['co', 'ben', 'luc', 'li', 'nao'];
  G.SAN = SAN;

  /* base[sân][cấp 1..5] — chỉ số chính ăn được.
     Uma cho 70 lượt để đi từ 0 tới trần 1200; ở đây chỉ có 24 lượt nên mỗi buổi phải ăn dày
     gấp ba, nếu không cuối mùa vẫn còn hạng F. Số dưới đây căn để: dồn 2–3 chỉ số thì cuối
     mùa chạm hạng A/S, dàn đều cả 5 thì chỉ tới B — đúng ý "phải chọn". */
  var BASE = {
    co:  [42, 58, 77, 100, 128],
    ben: [39, 54, 72,  94, 120],
    luc: [39, 54, 72,  94, 120],
    li:  [37, 51, 68,  89, 114],
    nao: [27, 37, 49,  64,  82]   /* ăn ít hơn, bù lại không tốn thể lực (đúng như Wit của Uma) */
  };
  /* chỉ số phụ ăn kèm: [chỉ số phụ, số điểm] */
  var PHU = {
    co:  [['luc', 18]],
    ben: [['li', 14]],
    luc: [['co', 18], ['ben', 11]],
    li:  [['ben', 14], ['co', 11]],
    nao: [['co', 9]]
  };
  var HAO = { co: -16, ben: -15, luc: -16, li: -17, nao: 4 };   /* thể lực; Não hoàn lại */
  var DIEM_KN = { co: 3, ben: 3, luc: 3, li: 3, nao: 6 };
  var THAN_MOI_BUOI = 20;        /* 20 lượt tập mà mỗi buổi chỉ +7 thì cầu vồng không kịp nổ */

  var TAM = [
    { id: 'rat_te', ten: 'RẤT TỆ', he: 0.80, lop: 't-bad' },
    { id: 'te', ten: 'TỆ', he: 0.90, lop: 't-bad' },
    { id: 'thuong', ten: 'THƯỜNG', he: 1.00, lop: '' },
    { id: 'tot', ten: 'TỐT', he: 1.10, lop: '' },
    { id: 'rat_tot', ten: 'RẤT TỐT', he: 1.20, lop: 't-great' }
  ];
  G.TAM = TAM;

  /* ══════════════════ mở một ca ══════════════════ */
  G.moCa = function (hlvId, dsTT, dsCuu, hat) {
    var goc = G.HLV_THEO_ID[hlvId];
    var ban = G.coHLV(hlvId) || G.taoHLV(hlvId);
    var rng = G.Rng(hat || (Date.now() & 0x7fffffff));

    var ca = {
      hlvId: hlvId, uncap: ban.uncap,
      tt: dsTT.slice(0, 5),            /* id tuyển thủ */
      cuu: (dsCuu || []).slice(0, 2),
      luot: 1, soLuot: G.SO_LUOT,
      chiso: [0, 0, 0, 0, 0],
      tran: goc.tran.slice(),
      diemKN: 0,
      theluc: 100, thelucMax: 100,
      tam: 2,                           /* chỉ số trong mảng TAM */
      sanCap: [1, 1, 1, 1, 1],
      sanDem: [0, 0, 0, 0, 0],
      than: [0, 0, 0, 0, 0],            /* thân thiết 0..100 từng tuyển thủ */
      oSan: [-1, -1, -1, -1, -1],       /* lượt này tuyển thủ thứ i đứng sân nào (-1 = vắng) */
      goiY: [false, false, false, false, false],  /* tuyển thủ thứ i có dấu ! không */
      hint: {},                         /* idKyNang -> số cấp gợi ý (giảm giá) */
      kyNang: [],                       /* kỹ năng đã mua */
      trangThai: [],                    /* trạng thái xấu */
      nk: [],                           /* năng khiếu sau kế thừa */
      thanhTich: [],                    /* kết quả từng giải trong mùa */
      veCuu: 1,                         /* vé cứu: đá lại 1 trận thua (DESIGN.md §10.7) */
      xong: false, dut: false,
      hat: rng.hat(), rng: rng,
      log: []
    };

    /* năng khiếu: sao chép của HLV rồi cho spark hồng nâng lên */
    ca.nk = JSON.parse(JSON.stringify(goc.nk));

    /* chỉ số khởi điểm = của HLV + nền tích luỹ + thẻ tuyển thủ + spark xanh */
    var i, k;
    for (i = 0; i < 5; i++) ca.chiso[i] = goc.dau[i] + (ban.nen ? ban.nen[i] : 0);
    ca.tt.forEach(function (id) {
      var b = G.coTT(id); if (!b) return;
      var h = G.hieuThuc(b);
      if (h.dau) for (k in h.dau) {
        var idx = SAN.indexOf(k); if (idx >= 0) ca.chiso[idx] += Math.round(h.dau[k]);
      }
      /* thân thiết khởi điểm */
      var vt = ca.tt.indexOf(id);
      if (h.thanDau) ca.than[vt] = Math.round(h.thanDau * 100 * 0.5);
    });

    G.apKeThua(ca);

    for (i = 0; i < 5; i++) ca.chiso[i] = G.kep(Math.round(ca.chiso[i]), 0, ca.tran[i]);

    /* trần chỉ số: uncap HLV cộng thêm 50 mỗi bậc */
    for (i = 0; i < 5; i++) ca.tran[i] += ca.uncap * 50;

    G.raiNguoi(ca);
    return ca;
  };

  /* ══════════════════ kế thừa từ 2 cựu HLV ══════════════════ */
  G.apKeThua = function (ca) {
    ca.spark = { xanh: [], hong: [], la: [], trang: [] };
    if (!ca.cuu || !ca.cuu.length) return;
    var rng = ca.rng;

    ca.cuu.forEach(function (hs) {
      if (!hs) return;
      var hop = hs.hop || 0;                          /* 0 △ · 1 ○ · 2 ◎ */
      var themHop = hop === 2 ? 0.25 : hop === 1 ? 0.12 : 0;

      (hs.sparks || []).forEach(function (sp) {
        var ti = 0.30 + 0.10 * sp.sao + themHop;
        if (!rng.duoc(G.kep(ti, 0, 0.95))) return;

        if (sp.mau === 'xanh') {
          var idx = SAN.indexOf(sp.khoa);
          if (idx >= 0) { ca.chiso[idx] += sp.sao * 12; ca.spark.xanh.push(sp); }
        } else if (sp.mau === 'hong') {
          var nhom = sp.nhom, khoa = sp.khoa;
          if (ca.nk[nhom] && ca.nk[nhom][khoa]) {
            ca.nk[nhom][khoa] = G.nangNK(ca.nk[nhom][khoa], Math.min(sp.sao, 4));
            ca.spark.hong.push(sp);
          }
        } else if (sp.mau === 'la') {
          if (sp.kn && ca.kyNang.indexOf(sp.kn) < 0) { ca.kyNang.push(sp.kn); ca.spark.la.push(sp); }
        } else {
          ca.diemKN += sp.sao * 25;
          if (sp.kn) ca.hint[sp.kn] = (ca.hint[sp.kn] || 0) + sp.sao;
          ca.spark.trang.push(sp);
        }
      });
    });
  };

  /* ══════════════════ rải tuyển thủ vào 5 sân ══════════════════ */
  G.raiNguoi = function (ca) {
    var rng = ca.rng;
    ca.oSan = [-1, -1, -1, -1, -1];
    ca.goiY = [false, false, false, false, false];

    ca.tt.forEach(function (id, i) {
      var goc = G.TUYENTHU_THEO_ID[id]; if (!goc) return;
      var b = G.coTT(id) || { id: id, cap: 1, uncap: 0 };
      var h = G.hieuThuc(b);

      if (!rng.duoc(0.86)) return;               /* hôm nay bận, không ra sân nào */

      var ts = [1, 1, 1, 1, 1];
      var uu = h.uuTien || 0;
      if (goc.loai !== 'ban') {
        var idx = SAN.indexOf(goc.loai);
        if (idx >= 0) ts[idx] += 1 + uu * 4;
      } else {
        for (var j = 0; j < 5; j++) ts[j] += uu * 1.2;
      }
      var tong = ts.reduce(function (a, b2) { return a + b2; }, 0);
      var v = rng() * tong, san = 0;
      for (var k = 0; k < 5; k++) { v -= ts[k]; if (v <= 0) { san = k; break; } }
      ca.oSan[i] = san;

      /* dấu gợi ý kỹ năng */
      if (rng.duoc(h.tanSuatGoiY || 0.2)) ca.goiY[i] = true;
    });
  };

  /** tuyển thủ thứ i có đang cầu vồng ở sân s không? */
  G.cauVong = function (ca, i, s) {
    if (ca.oSan[i] !== s) return false;
    if (ca.than[i] < 80) return false;
    var goc = G.TUYENTHU_THEO_ID[ca.tt[i]];
    if (!goc) return false;
    return goc.loai === 'ban' || SAN.indexOf(goc.loai) === s;
  };

  /* ══════════════════ xem trước một sân ══════════════════ */
  G.xemTruoc = function (ca, s) {
    var goc = G.HLV_THEO_ID[ca.hlvId];
    var cap = ca.sanCap[s];
    var khoa = SAN[s];
    var base = BASE[khoa][cap - 1];

    /* hệ số từ thẻ tuyển thủ đang đứng ở sân này (và cả thẻ không đứng — hiệu quả tập chung) */
    var congGA = 0, hieuQua = 0, cv = 1, dong = 0, chongHong = 0, giamHao = 0, congKN = 0, tinhThan = 0;
    var nguoi = [];

    ca.tt.forEach(function (id, i) {
      var b = G.coTT(id); if (!b) return;
      var h = G.hieuThuc(b);
      hieuQua += h.hieuqua || 0;
      chongHong += h.chongHong || 0;
      giamHao += h.giamHao || 0;
      congKN += h.congDiemKN || 0;
      tinhThan += h.tinhthan || 0;
      if (ca.oSan[i] !== s) return;

      dong++;
      nguoi.push(i);
      if (h.congGiaoAn && h.congGiaoAn[khoa]) congGA += h.congGiaoAn[khoa];
      if (G.cauVong(ca, i, s)) {
        var gocTT = G.TUYENTHU_THEO_ID[id];
        var mucCV = gocTT.bac === 'SSR' ? 1.6 : gocTT.bac === 'SR' ? 1.35 : 1.2;
        mucCV += (h.than || 0) * 0.8 + b.uncap * 0.05;
        cv *= mucCV;
      }
    });

    /* tâm trạng — thẻ có "tinh thần" khuếch đại độ lệch so với 1.0 */
    var heTam = TAM[ca.tam].he;
    heTam = 1 + (heTam - 1) * (1 + tinhThan);

    var heDong = 1 + 0.05 * dong;
    var heHop = goc.hop[s] || 1;

    var chinh = Math.floor(base * (1 + congGA + hieuQua) * cv * heTam * heDong * heHop);

    var an = [0, 0, 0, 0, 0];
    an[s] = chinh;
    (PHU[khoa] || []).forEach(function (p) {
      var idx = SAN.indexOf(p[0]);
      if (idx >= 0) an[idx] = Math.floor(p[1] * (1 + hieuQua) * cv * heTam * heDong * 0.9);
    });

    var kn = Math.floor(DIEM_KN[khoa] * (1 + congKN) * heDong);

    /* thể lực */
    var hao = HAO[khoa];
    if (hao < 0) hao = Math.round(hao * (1 - G.kep(giamHao, 0, 0.5)));
    else {
      var themNao = 0;
      ca.tt.forEach(function (id, i) {
        if (ca.oSan[i] !== s) return;
        var b = G.coTT(id); if (!b) return;
        var h = G.hieuThuc(b);
        themNao += h.hoiNao || 0;
      });
      hao = Math.round(hao + themNao);
    }

    /* tỉ lệ hỏng */
    var conLai = ca.theluc + Math.min(0, hao);
    var hong = 0;
    if (conLai < 50) hong = G.kep((50 - conLai) * 1.6, 0, 90);
    hong = Math.round(hong * (1 - G.kep(chongHong, 0, 0.75)));
    if (ca.trangThai.indexOf('moi_tay') >= 0 && khoa === 'co') hong += 5;

    return {
      san: s, an: an, diemKN: kn, hao: hao, hong: hong,
      nguoi: nguoi, cauVong: cv > 1.001, heCV: cv, cap: cap
    };
  };

  /* ══════════════════ làm việc của lượt ══════════════════ */

  function themLog(ca, tieu, dong) {
    ca.log.push({ luot: ca.luot, tieu: tieu, dong: dong });
    if (ca.log.length > 120) ca.log.shift();
  }

  function congChiSo(ca, an) {
    var ghi = [];
    for (var i = 0; i < 5; i++) {
      if (!an[i]) continue;
      var truoc = ca.chiso[i];
      ca.chiso[i] = G.kep(ca.chiso[i] + an[i], 0, ca.tran[i]);
      var that = ca.chiso[i] - truoc;
      if (that) ghi.push({ t: G.TEN_CHISO[i], v: that });
    }
    return ghi;
  }

  G.lamViec = function (ca, viec) {
    if (ca.xong) return null;
    var rng = ca.rng, kq = { loai: viec.loai, dong: [], sk: null };

    if (viec.loai === 'tap') {
      var xt = G.xemTruoc(ca, viec.san);
      var hong = rng() * 100 < xt.hong;

      if (hong) {
        var nang = xt.hong >= 30;
        ca.theluc = G.kep(ca.theluc + Math.round(xt.hao * 0.5), 0, ca.thelucMax);
        ca.tam = G.kep(ca.tam - 1, 0, 4);
        kq.hong = true; kq.nang = nang;
        kq.dong.push({ t: 'Buổi tập hỏng', v: 0, xau: true });
        if (nang) {
          var mat = rng.khoang(5, 15);
          ca.chiso[viec.san] = Math.max(0, ca.chiso[viec.san] - mat);
          kq.dong.push({ t: G.TEN_CHISO[viec.san], v: -mat });
          if (rng.duoc(0.45)) {
            var tt = rng.chon(['moi_tay', 'mat_ngu', 'tam_ly']);
            if (ca.trangThai.indexOf(tt) < 0) {
              ca.trangThai.push(tt);
              kq.dong.push({ t: 'Dính: ' + G.TEN_TRANGTHAI[tt], v: 0, xau: true });
            }
          }
        }
        themLog(ca, 'Tập ' + G.TEN_CHISO[viec.san] + ' — HỎNG', kq.dong);
      } else {
        var ghi = congChiSo(ca, xt.an);
        ca.diemKN += xt.diemKN;
        ghi.push({ t: 'Điểm KN', v: xt.diemKN, vang: true });
        ca.theluc = G.kep(ca.theluc + xt.hao, 0, ca.thelucMax);
        ghi.push({ t: 'Thể lực', v: xt.hao });

        /* thân thiết + gợi ý */
        xt.nguoi.forEach(function (i) {
          var b = G.coTT(ca.tt[i]);
          var h = b ? G.hieuThuc(b) : {};
          var them = Math.round(THAN_MOI_BUOI * (1 + (h.than || 0) * 0.5));
          var truoc = ca.than[i];
          ca.than[i] = G.kep(ca.than[i] + them, 0, 100);
          if (ca.than[i] !== truoc) {
            ghi.push({ t: 'Thân thiết ' + G.TUYENTHU_THEO_ID[ca.tt[i]].biet, v: ca.than[i] - truoc });
          }
          if (truoc < 80 && ca.than[i] >= 80) {
            ghi.push({ t: '★ ' + G.TUYENTHU_THEO_ID[ca.tt[i]].biet + ' đã mở CẦU VỒNG', v: 0, vang: true });
            kq.moCauVong = true;
          }
          if (ca.goiY[i]) {
            var gocTT = G.TUYENTHU_THEO_ID[ca.tt[i]];
            var kn = rng.chon(gocTT.goiY || []);
            if (kn) {
              ca.hint[kn] = (ca.hint[kn] || 0) + 1;
              var kobj = G.knTatCa(kn);
              ghi.push({ t: 'Gợi ý: ' + (kobj ? kobj.ten : kn), v: 0, vang: true });
            }
          }
        });

        /* lên cấp sân sau mỗi 3 lần tập */
        ca.sanDem[viec.san]++;
        if (ca.sanDem[viec.san] % 3 === 0 && ca.sanCap[viec.san] < 5) {
          ca.sanCap[viec.san]++;
          ghi.push({ t: 'Sân ' + G.TEN_CHISO[viec.san] + ' lên cấp ' + ca.sanCap[viec.san], v: 0, vang: true });
          kq.lenCap = viec.san;
        }

        kq.dong = ghi;
        kq.cauVong = xt.cauVong;
        themLog(ca, 'Tập ' + G.TEN_CHISO[viec.san] + (xt.cauVong ? ' 🌈' : ''), ghi);
      }

    } else if (viec.loai === 'nghi') {
      var hoi = rng.khoang(30, 70);
      ca.theluc = G.kep(ca.theluc + hoi, 0, ca.thelucMax);
      kq.dong.push({ t: 'Thể lực', v: hoi });
      if (rng.duoc(0.25)) { ca.tam = G.kep(ca.tam + 1, 0, 4); kq.dong.push({ t: 'Tâm trạng lên', v: 0, vang: true }); }
      themLog(ca, 'Nghỉ', kq.dong);

    } else if (viec.loai === 'xahoi') {
      var len = rng.duoc(0.35) ? 2 : 1;
      var truocT = ca.tam;
      ca.tam = G.kep(ca.tam + len, 0, 4);
      var hoi2 = rng.khoang(10, 25);
      ca.theluc = G.kep(ca.theluc + hoi2, 0, ca.thelucMax);
      kq.dong.push({ t: 'Tâm trạng', v: ca.tam - truocT });
      kq.dong.push({ t: 'Thể lực', v: hoi2 });
      themLog(ca, 'Xả hơi', kq.dong);

    } else if (viec.loai === 'yte') {
      if (ca.trangThai.length) {
        var bo = ca.trangThai.shift();
        kq.dong.push({ t: 'Gỡ: ' + G.TEN_TRANGTHAI[bo], v: 0, vang: true });
      } else {
        kq.dong.push({ t: 'Không có gì để chữa', v: 0 });
      }
      ca.theluc = G.kep(ca.theluc + 10, 0, ca.thelucMax);
      kq.dong.push({ t: 'Thể lực', v: 10 });
      themLog(ca, 'Phòng y tế', kq.dong);

    } else if (viec.loai === 'giaohuu') {
      var hao2 = -18;
      ca.theluc = G.kep(ca.theluc + hao2, 0, ca.thelucMax);
      var them = rng.khoang(18, 30);
      ca.diemKN += them;
      var fan = rng.khoang(200, 700);
      G.S.clb.fan += fan;
      kq.dong.push({ t: 'Điểm KN', v: them, vang: true });
      kq.dong.push({ t: 'Danh tiếng', v: fan, vang: true });
      kq.dong.push({ t: 'Thể lực', v: hao2 });
      /* trận giao hữu cho kinh nghiệm tướng — thông thạo nhích lên */
      kq.dong.push({ t: 'Cả đội ôn tướng', v: 0 });
      kq.giaohuu = true;
      themLog(ca, 'Kèo giao hữu', kq.dong);
    }

    /* trạng thái xấu ăn mòn mỗi lượt */
    if (ca.trangThai.indexOf('mat_ngu') >= 0) {
      ca.theluc = G.kep(ca.theluc - 5, 0, ca.thelucMax);
      kq.dong.push({ t: 'Mất ngủ', v: -5, xau: true });
    }
    if (ca.trangThai.indexOf('tam_ly') >= 0 && ca.tam > 2) ca.tam = 2;

    /* sự kiện ngẫu nhiên sau việc */
    if (!kq.hong && rng.duoc(0.35)) kq.sk = G.rutSuKien(ca);

    return kq;
  };

  /** kết thúc lượt: tăng số lượt, rải lại người, trả về giải nếu lượt vừa xong có trận */
  G.sangLuot = function (ca) {
    var muc = G.LICH[ca.luot - 1];
    ca.luot++;
    if (ca.luot > ca.soLuot) ca.xong = true;
    G.raiNguoi(ca);
    /* cảm hứng giữa mùa (DESIGN.md §5.3) */
    if (ca.luot === 12 || ca.luot === 20) return { camHung: true, giai: muc && muc.giai };
    return { giai: muc && muc.giai };
  };

  /** cảm hứng: nổ spark của ông bà */
  G.camHung = function (ca) {
    var rng = ca.rng, ghi = [];
    var lan = rng.khoang(2, 4);
    for (var i = 0; i < lan; i++) {
      var idx = rng.nguyen(5);
      var them = rng.khoang(8, 26);
      ca.chiso[idx] = G.kep(ca.chiso[idx] + them, 0, ca.tran[idx]);
      ghi.push({ t: G.TEN_CHISO[idx], v: them });
    }
    var kn = rng.khoang(20, 60);
    ca.diemKN += kn;
    ghi.push({ t: 'Điểm KN', v: kn, vang: true });
    themLog(ca, 'CẢM HỨNG!', ghi);
    return ghi;
  };

  /* ══════════════════ mua kỹ năng ══════════════════ */
  G.giaKyNang = function (ca, id) {
    var k = G.KN_THEO_ID[id]; if (!k) return 0;
    var giam = G.kep((ca.hint[id] || 0) * 0.15, 0, 0.45);
    return Math.round(k.gia * (1 - giam));
  };

  G.coTheMua = function (ca, id) {
    if (ca.kyNang.indexOf(id) >= 0) return 'da_co';
    var can = G.KN_CAN[id];
    if (can && ca.kyNang.indexOf(can) < 0) return 'thieu_goc';
    if (ca.diemKN < G.giaKyNang(ca, id)) return 'thieu_diem';
    return null;
  };

  G.muaKyNang = function (ca, id) {
    var loi = G.coTheMua(ca, id); if (loi) return loi;
    ca.diemKN -= G.giaKyNang(ca, id);
    ca.kyNang.push(id);
    themLog(ca, 'Mua kỹ năng', [{ t: G.KN_THEO_ID[id].ten, v: 0, vang: true }]);
    return null;
  };

  /* ══════════════════ kết ca ══════════════════ */
  G.ketCa = function (ca) {
    ca.xong = true;
    var S = G.S;
    var ban = G.coHLV(ca.hlvId);
    if (ban) {
      ban.soCa = (ban.soCa || 0) + 1;
      /* mỗi ca để lại một chút "nền" cho lần nuôi sau — thưởng cho việc chơi lại */
      for (var i = 0; i < 5; i++) {
        ban.nen[i] = Math.max(ban.nen[i], Math.floor(ca.chiso[i] * 0.06));
      }
    }
    /* hồ sơ cựu HLV để đời sau kế thừa */
    var hs = G.taoHoSoCuu(ca);
    S.cuu.unshift(hs);
    if (S.cuu.length > 24) S.cuu.pop();
    S.clb.mua++;
    S.ca = null;
    G.luu();
    return hs;
  };

  /** biến một ca đã xong thành hồ sơ cựu HLV kèm spark (DESIGN.md §5.1) */
  G.taoHoSoCuu = function (ca) {
    var rng = ca.rng, sparks = [];
    var goc = G.HLV_THEO_ID[ca.hlvId];

    /* spark xanh: chỉ số cao nhất, sao theo ngưỡng 600 / 1100 */
    var top = 0;
    for (var i = 1; i < 5; i++) if (ca.chiso[i] > ca.chiso[top]) top = i;
    var sao = ca.chiso[top] >= 1100 ? 3 : ca.chiso[top] >= 600 ? 2 : 1;
    sparks.push({ mau: 'xanh', khoa: SAN[top], sao: sao });

    /* spark hồng: một năng khiếu hạng A/S */
    var ah = [];
    ['san', 'nhip', 'the'].forEach(function (nhom) {
      for (var k in ca.nk[nhom]) {
        if (ca.nk[nhom][k] === 'A' || ca.nk[nhom][k] === 'S') ah.push({ nhom: nhom, khoa: k, h: ca.nk[nhom][k] });
      }
    });
    if (ah.length) {
      var c = rng.chon(ah);
      sparks.push({ mau: 'hong', nhom: c.nhom, khoa: c.khoa, sao: c.h === 'S' ? 3 : 2 });
    }

    /* spark lá: kỹ năng riêng, chỉ khi ca đi xa */
    var thang = ca.thanhTich.filter(function (t) { return t.thang; }).length;
    if (thang >= 5) sparks.push({ mau: 'la', kn: goc.kn, sao: thang >= 7 ? 3 : 2 });

    /* spark trắng: 2 kỹ năng đã mua */
    ca.kyNang.slice(0, 2).forEach(function (kn) {
      sparks.push({ mau: 'trang', kn: kn, sao: 1 });
    });

    return {
      hlvId: ca.hlvId, ten: goc.ten, mua: G.S.clb.mua,
      chiso: ca.chiso.slice(), nk: ca.nk, sparks: sparks,
      thang: thang, vodich: ca.thanhTich.length && ca.thanhTich[ca.thanhTich.length - 1].id === 'w4' &&
        ca.thanhTich[ca.thanhTich.length - 1].thang,
      hop: 0
    };
  };

  G.TEN_TRANGTHAI = {
    moi_tay: 'Mỏi tay', mat_ngu: 'Mất ngủ', tam_ly: 'Tâm lý lung lay',
    drama: 'Drama truyền thông', cai_nhau: 'Cãi nhau nội bộ'
  };

})(window);
