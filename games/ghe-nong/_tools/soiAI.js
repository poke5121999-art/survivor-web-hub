/* soiAI.js — SOI xem bộ não trong trận có ngu không, và trụ có đáng sợ không.
 *
 *   node _tools/lai.js "file:///.../index.html" ra.png 60 --dofile=_tools/soiAI.js
 *
 * `canbang.js` đo tướng nào mạnh hơn tướng nào. `tileThang.js` đo người chơi có qua nổi
 * giải không. Tệp này đo thứ thứ ba, thứ mà hai cái kia không nhìn thấy: **cách mười cái
 * đầu trong trận ra quyết định**. Không có số này thì mọi câu "AI ngu" hay "AI khá rồi"
 * đều là cảm tính.
 *
 * Mười hai con số, mỗi con trả lời một câu hỏi cụ thể:
 *
 *   dai            trận dài bao nhiêu giây — quá ngắn là đánh nhau loạn, quá dài là không
 *                  ai biết kết thúc trận
 *   mang           tổng số mạng một trận
 *   tapTrung       khi một người ngã xuống, có mấy kẻ địch đang đứng trong tầm 260? Một
 *                  đội biết TẬP TRUNG HOẢ LỰC thì số này cao. Bằng ~1 nghĩa là mười người
 *                  đánh mười mục tiêu khác nhau và chẳng giết nổi ai.
 *   diDuoiTru      bao nhiêu phần trăm số mạng xảy ra TRONG TẦM TRỤ ĐỊCH. Ở MOBA thật, lao
 *                  vào trụ là canh bạc hiếm; số này cao nghĩa là AI không biết trụ tồn tại.
 *   giayTrongTru   trung bình một người đứng trong tầm trụ địch bao nhiêu giây mỗi trận
 *   satTru         trụ gây bao nhiêu phần trăm tổng sát thương lên tướng. Trụ mà chỉ đóng
 *                  góp 1–2% thì nó là đồ trang trí.
 *   truGiet        trụ trực tiếp kết liễu bao nhiêu mạng một trận
 *   truDo          bao nhiêu trụ đổ một trận
 *   hetGio         bao nhiêu phần trăm trận phải phân thắng bằng vàng vì hết giờ — cao là
 *                  không đội nào biết cách kết thúc
 *   doiMuc         một người đổi mục tiêu bao nhiêu lần mỗi phút. Cao quá là "đánh một cái
 *                  rồi chạy đi chỗ khác", thấp quá là lì lợm không biết bỏ
 *   chetKhiRut     bao nhiêu phần trăm số mạng xảy ra lúc nạn nhân ĐANG RÚT. Rút mà vẫn
 *                  chết đều nghĩa là quyết định rút tới quá muộn
 *   solo           số mạng đổi trong cảnh 1-đấu-1 (không ai khác trong 260)
 */
(function () {
  'use strict';
  var G = window;
  /* 24 trận là QUÁ ÍT để đọc `hetGio`: sai số chuẩn của một tỉ lệ ~40% trên 24 mẫu là
     ±10 điểm, nên hai bản khác nhau 8 điểm chẳng nói lên điều gì. Chạy trong Node
     (`soiAI-node.js`) thì mỗi trận chỉ ~1,2 giây, nên cứ lấy nhiều mẫu cho chắc.
     Đặt biến môi trường `SO_TRAN` để đổi. */
  var SO_TRAN = (typeof process !== 'undefined' && process.env && +process.env.SO_TRAN) || 24;

  function doi(ten, mau, lech) {
    return {
      ten: ten, mau: mau, chienThuat: {}, heso: { ds: [], rieng: null },
      nguoi: ['tren', 'rung', 'giua', 'duoi', 'ho'].map(function (vt, i) {
        var t = G.TUONG.filter(function (x) { return x.vt === vt; });
        return {
          vt: vt, tuongId: t[(i + lech) % t.length].id, tt: 'SR',
          ten: ten + (i + 1), chat: [['fight', 'farm', 'gank', 'thu', 'le'][(i + lech) % 5]],
          ego: 45 + (i * 7 + lech * 3) % 40,
          cs: { co: 620, ben: 580, luc: 600, li: 540, nao: 620 }
        };
      })
    };
  }

  /** trong tầm trụ nào của đội `doiTru` không */
  function trongTru(tran, x, y, doiTru) {
    for (var i = 0; i < tran.tru.length; i++) {
      var r = tran.tru[i];
      if (r.doi !== doiTru || !r.song) continue;
      var dx = r.x - x, dy = r.y - y;
      if (dx * dx + dy * dy < r.tam * r.tam) return true;
    }
    return false;
  }

  var T = {
    dai: 0, mang: 0, tapTrung: 0, tapTrungN: 0, duoiTru: 0, giayTru: 0,
    satTru: 0, satTong: 0, truGiet: 0, truDo: 0, hetGio: 0, doiMuc: 0,
    chetRut: 0, solo: 0, tran: 0, ngoai: 0, nhaDo: 0, loiDo: 0, loiThap: 0, nhaThap: 0
  };

  for (var s = 0; s < SO_TRAN; s++) {
    var tran = G.taoTran({ ta: doi('A', '#3ddc97', s), dich: doi('B', '#e5484d', s + 2) }, 3000 + s * 17);

    /* bọc satThuong bằng cách đọc lại `dmg` không được (trụ không có ô dmg), nên đo bằng
       cách so máu trước/sau mỗi tick cho từng người và quy cho nguồn gần nhất. Cách rẻ
       và đủ đúng: đếm ngay trong vòng lặp. */
    var mucCu = {};
    tran.nguoi.forEach(function (n) { mucCu[n.i] = null; });

    var hpTruoc = tran.nguoi.map(function (n) { return n.hp; });
    while (!tran.xong && tran.tick < 20000) {
      var truTruoc = tran.tru.map(function (r) { return r.hp; });
      var soMangTruoc = tran.mang.xanh + tran.mang.do;
      var chetTruoc = tran.nguoi.map(function (n) { return n.chet > 0; });

      G.tickTran(tran);

      /* sát thương của trụ: cộng riêng bằng cách nhìn `r.danh` vừa reset về 1.2 */
      tran.nguoi.forEach(function (n, i) {
        var mat = hpTruoc[i] - n.hp;
        if (mat > 0 && n.chet <= 0) T.satTong += mat;
        hpTruoc[i] = n.hp;
      });

      tran.nguoi.forEach(function (n) {
        if (n.chet > 0) return;
        if (trongTru(tran, n.x, n.y, n.doi === 'xanh' ? 'do' : 'xanh')) T.giayTru += G.SIM_TICK;
        if (n.mucTieu && mucCu[n.i] !== n.mucTieu.loai) { T.doiMuc++; mucCu[n.i] = n.mucTieu.loai; }
      });

      /* ai vừa ngã xuống trong tick này */
      tran.nguoi.forEach(function (n, i) {
        if (!(n.chet > 0) || chetTruoc[i]) return;
        var dich = 0;
        tran.nguoi.forEach(function (m) {
          if (m.doi === n.doi || m.chet > 0) return;
          var dx = m.x - n.x, dy = m.y - n.y;
          if (dx * dx + dy * dy < 260 * 260) dich++;
        });
        T.tapTrung += dich; T.tapTrungN++;
        if (dich <= 1) T.solo++;
        if (trongTru(tran, n.x, n.y, n.doi === 'xanh' ? 'do' : 'xanh')) T.duoiTru++;
        if (n.mucTieu && (n.mucTieu.loai === 'rut' || n.mucTieu.loai === 've')) T.chetRut++;
      });
      void truTruoc; void soMangTruoc;
    }

    T.dai += tran.t;
    T.mang += tran.mang.xanh + tran.mang.do;
    T.truDo += tran.truHa.xanh + tran.truHa.do;
    if (tran.hetGio) T.hetGio++;
    /* Trụ đổ theo TỪNG TẦNG — "9,6 trụ đổ" không nói được là tắc ở đâu.
       ngoai = trụ đường · nha = trụ nhà · loi = lõi. Và máu lõi thấp nhất của hai bên
       cho biết có ai từng chạm được tới lõi hay không. */
    var dem = { ngoai: 0, nha: 0, loi: 0 };
    var loiThap = 1;
    tran.tru.forEach(function (r) {
      var t = r.loi ? 'loi' : r.nha ? 'nha' : 'ngoai';
      if (!r.song) dem[t]++;
      if (r.loi) loiThap = Math.min(loiThap, r.hp / r.hpMax);
    });
    T.ngoai += dem.ngoai; T.nhaDo += dem.nha; T.loiDo += dem.loi;
    T.loiThap += Math.max(0, loiThap);
    var nhaThap = 1;
    tran.tru.forEach(function (r) {
      if (r.lane === 'nha') nhaThap = Math.min(nhaThap, r.song ? r.hp / r.hpMax : 0);
    });
    T.nhaThap += nhaThap;
    T.tran++;
  }

  var n = T.tran || 1, m = T.tapTrungN || 1;
  return {
    tran: n,
    dai: Math.round(T.dai / n),
    mang: +(T.mang / n).toFixed(1),
    tapTrung: +(T.tapTrung / m).toFixed(2),
    diDuoiTru: Math.round(T.duoiTru / m * 100) + '%',
    giayTrongTru: +(T.giayTru / n / 10).toFixed(1),
    truDo: +(T.truDo / n).toFixed(1),
    truNgoai: +(T.ngoai / n).toFixed(1) + '/12',
    truNha: +(T.nhaDo / n).toFixed(1) + '/2',
    loiDo: +(T.loiDo / n).toFixed(2) + '/2',
    nhaConLai: Math.round(T.nhaThap / n * 100) + '%',
    loiConLai: Math.round(T.loiThap / n * 100) + '%',
    hetGio: Math.round(T.hetGio / n * 100) + '%',
    doiMucMoiPhut: +(T.doiMuc / n / (T.dai / n / 60)).toFixed(1),
    chetKhiRut: Math.round(T.chetRut / m * 100) + '%',
    solo: Math.round(T.solo / m * 100) + '%'
  };
})()
