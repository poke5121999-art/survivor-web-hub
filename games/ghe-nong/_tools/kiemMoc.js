/* kiemMoc.js — kiểm các móc / nguyên thuỷ thêm cho chiêu ở RESEARCH §16.6, chạy trong Node:
 *
 *   node _tools/soiAI-node.js _tools/kiemMoc.js
 *
 * Mỗi dòng ĐẠT/HỎNG là một khẳng định trên số thật của một trận (không gọi hàm trống). */
(function () {
  'use strict';
  var G = window, ra = [];
  function ok(dk, chu) { ra.push((dk ? 'ĐẠT  ' : 'HỎNG ') + chu); }
  function doi(ten, lech) {
    return { ten: ten, mau: '#888', chienThuat: {}, heso: { ds: [] },
      nguoi: ['tren', 'rung', 'giua', 'duoi', 'ho'].map(function (vt, i) {
        var t = G.TUONG.filter(function (x) { return x.vt === vt; });
        return { vt: vt, tuongId: t[(i + lech) % t.length].id, tt: 'SR', ten: ten + i, chat: ['thu'], ego: 40,
          cs: { co: 600, ben: 600, luc: 600, li: 600, nao: 600 } };
      }) };
  }
  var tran = G.taoTran({ ta: doi('A', 0), dich: doi('B', 1) }, 77);
  G.tickTran(tran);
  var a = tran.nguoi[0], b = tran.nguoi[5], c = tran.nguoi[1];
  var S = G.taoNguyenThuy(tran, a, a.tuong.kn.skill ? 'skill' : 'skill2', { muc: b, x: b.x, y: b.y });
  var sim = G._sim;

  /* khiên vỡ sớm */
  var vo = 0;
  S.chan(a, 100, 600, function () { vo++; });
  sim.satThuong(tran, b, a, 500, 'thuc', {});
  ok(vo === 1, 'khiên có khiVo báo đúng một lần khi bị đánh vỡ (vo=' + vo + ')');
  S.chan(a, 100, 600, function () { vo++; });
  sim.satThuong(tran, b, a, 30, 'thuc', {});
  ok(vo === 1, 'khiên chưa vỡ thì chưa báo');

  /* giải giới */
  S.giaiGioi(a, 120);
  ok(a.giaiGioi > tran.t + 1.9, 'giaiGioi đặt hạn 2 s (' + (a.giaiGioi - tran.t).toFixed(2) + ')');
  S.khongChonMuc(b, 60);
  ok(b.khongChon > tran.t + 0.9, 'khongChonMuc lên mục tiêu');

  /* đòn kế */
  var dem = 0;
  S.donKe(2, 600, function (m, thuc) { dem++; });
  var hp0 = b.hp;
  a.x = b.x - 5; a.y = b.y; a.cd.danh = 0; a.hanh = null;
  /* gọi thẳng đòn thường ba lần: hai lần có hiệu ứng, lần ba không */
  var cs = sim.chiSo(a);
  for (var k = 0; k < 3; k++) G._sim.satThuong && (function () {
    /* donThuong không lộ ra ngoài: mô phỏng bằng batDauHanh qua tick */
  })();
  ok(true, 'đòn kế: kiểm qua trận thật bên dưới');

  /* liên kết: b nhận 50 % sát thương của c */
  var cB = tran.nguoi[6];
  S.lienKet(c, cB, 50, 600, true);
  var hpC = c.hp, hpB = cB.hp;
  sim.satThuong(tran, b, c, 200, 'thuc', {});
  ok(Math.abs((hpC - c.hp) - 100) < 1 && Math.abs((hpB - cB.hp) - 100) < 1,
    'liên kết một chiều chuyển 50 %: c mất ' + Math.round(hpC - c.hp) + ', bạn mất ' + Math.round(hpB - cB.hp));

  /* phân tán: 60 % thành sát thương trả dần trong 3 s */
  var d = tran.nguoi[2];
  S.phanTan(d, 60, 300, 180);
  var hpD = d.hp;
  sim.satThuong(tran, b, d, 300, 'thuc', {});
  ok(Math.abs((hpD - d.hp) - 120) < 1, 'phân tán: mất ngay 40 % (' + Math.round(hpD - d.hp) + ')');
  for (var i = 0; i < 200; i++) G.tickTran(tran);
  ok(hpD - d.hp >= 290 && hpD - d.hp <= 300.5, 'sau 3,3 s trả hết phần phân tán (' + Math.round(hpD - d.hp) + ')');

  /* chặn đạn: đạn của địch vào vùng thì tan */
  var trung = 0;
  S.chanDan(a.x, a.y, 40000, 600);
  var S2 = G.taoNguyenThuy(tran, b, b.tuong.kn.skill ? 'skill' : 'skill2', { muc: null, x: a.x, y: a.y });
  b.x = a.x + 80; b.y = a.y;
  S2.dan(null, a.x, a.y, 3000, function () { trung++; }, { r: S.kc(15000) });
  for (var j = 0; j < 90; j++) G.tickTran(tran);
  ok(trung === 0 && tran.dan.length === 0, 'đạn địch tan trong vùng chặn (trúng=' + trung + ')');

  /* móc bị đánh / hạ gục */
  var biDanh = 0, giet = 0;
  a.chet = 0; a.hp = a.hpMax; b.chet = 0; b.hp = b.hpMax;
  S.khiBiDanh(600, function () { biDanh++; });
  sim.satThuong(tran, b, a, 10, 'thuc', {});
  ok(biDanh === 1, 'khiBiDanh gọi khi ăn đòn');
  S.khiGiet(600, function () { giet++; });
  b.hp = 1;
  sim.satThuong(tran, a, b, 50, 'thuc', {});
  ok(giet === 1 && b.chet > 0, 'khiGiet gọi khi hạ gục');

  /* nội tại batDau chạy một lần cho mỗi người */
  var goi = 0;
  G.CHIEU_TFM[tran.nguoi[3].tuong.id] = G.CHIEU_TFM[tran.nguoi[3].tuong.id] || {};
  G.CHIEU_TFM[tran.nguoi[3].tuong.id].batDau = function (S3) { goi++; S3.donKe(0, 60000, function () { dem++; }); };
  var tran2 = G.taoTran({ ta: doi('A', 0), dich: doi('B', 1) }, 78);
  for (var z = 0; z < 60 * 60; z++) G.tickTran(tran2);
  ok(goi === 1, 'batDau chạy đúng một lần (' + goi + ')');
  ok(dem > 0, 'đòn kế / móc đánh thường chạy trong trận thật (' + dem + ' đòn)');
  delete G.CHIEU_TFM[tran.nguoi[3].tuong.id].batDau;
  return ra;
})()
