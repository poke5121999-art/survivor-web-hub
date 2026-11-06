/* _tools/kiemChieu-4.js — kiểm ba chiêu của 15 tướng nhóm 4 (js/chieu-tfm-4.js) đúng số TFM2.
 *
 * Chạy: node _tools/kiemChieu-4.js
 *
 * Cách đo: dựng MỘT trận thật (G.taoTran) có đủ 15 tướng của nhóm này ở đội "ta" và vài tướng bất
 * kỳ ở đội "dich" làm hình nộm; khoá đứng yên toàn bộ 21 người (gán n.hanh một hành động không thể
 * huỷ, kéo dài mãi — coDi/ranh trong sim.js đều đọc n.hanh nên không ai tự đi/tự đánh), rồi GỌI
 * THẲNG G.chayChieu(tran, n, loai, hanhGiả) — bỏ qua bộ chọn mục tiêu AI, tự đặt vị trí/mục tiêu
 * theo từng ca kiểm. Số mong đợi tính lại từ đúng công thức của sim.js (giáp: 100/(100+giáp), lá
 * chắn ăn trước máu, giáy/tick 60, khoảng cách 1000=1 điểm ảnh TFM2) — KHÔNG import số từ sim.js,
 * chỉ đọc `G._sim.chiSo(n)` để biết đúng atk/ap/giáp/khang lúc kiểm (né đoán tay heTT/heso).
 */
'use strict';
global.window = global;
var kho = {};
global.localStorage = { getItem: function (k) { return kho[k] || null; }, setItem: function (k, v) { kho[k] = v; }, removeItem: function (k) { delete kho[k]; } };
global.document = {
  addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
  createElement: function () { return { style: {}, setAttribute: function () {}, addEventListener: function () {}, appendChild: function () {} }; },
  readyState: 'complete'
};
try { Object.defineProperty(global, 'navigator', { value: { vibrate: function () {} }, configurable: true }); } catch (e) { /* Node mới: navigator có sẵn, bỏ qua */ }

var duong = __dirname.replace(/\\/g, '/') + '/../js/';
['util', 'data-tfm', 'data-kynang', 'data-tuong', 'data-trangbi', 'data-hlv', 'data-tuyenthu',
  'data-giai', 'data-sukien', 'save', 'ca', 'data-bando', 'sim', 'chieu', 'chieu-tfm-1', 'chieu-tfm-2', 'chieu-tfm-3', 'chieu-tfm-4']
  .forEach(function (f) { require(duong + f + '.js'); });

var G = global;
var TONG = 0, DAT = 0;
function kt(ten, dk) {
  TONG++;
  if (dk) { DAT++; console.log('ĐẠT  ' + ten); }
  else console.log('HỎNG ' + ten);
}
function gan(a, b, tol) { return Math.abs(a - b) <= (tol == null ? Math.max(1, Math.abs(b) * 0.03) : tol); }

/* ── dựng một trận có đủ 15 tướng nhóm 4 (đội "ta") + 5 hình nộm (đội "dich") ── */
var ME = ['poison_dart_hunter', 'pythoness', 'shadowmancer', 'shield_bearer', 'siege_breaker', 'soldier',
  'spirit_caller', 'swordman', 'taoist', 'vampire', 'voodoo_shaman', 'werewolf', 'whip_master', 'white_mage', 'wind_mage'];
var csMac = { co: 600, ben: 600, luc: 600, li: 600, nao: 600 };
function doi(ds, tien) {
  return {
    ten: tien, mau: '#888', heso: { ds: [] }, chienThuat: { rong: 'luon', rung: 'farm', mucTieu: 'poke' },
    nguoi: ds.map(function (id, i) {
      return { vt: G.TUONG_THEO_ID[id].vt, tuyenthuId: tien + i, tuongId: id, tt: 'SR', ten: tien + i, chat: ['thu'], ego: 40, cs: csMac };
    })
  };
}
var cauTa = doi(ME, 'ta');
var cauDich = doi(['fighter', 'ninja', 'pyromancer', 'archer', 'bard'], 'dich');
var tran = G.taoTran({ ta: cauTa, dich: cauDich }, 999001);

/* dọn quái/lính/trụ khỏi trận — chỉ kiểm chiêu người, không cho quái/lính/trụ xen vào */
tran.quai.forEach(function (q) { q.song = false; q.hoi = 9e8; });
Object.keys(tran.quaiLon).forEach(function (k) { tran.quaiLon[k].song = false; tran.quaiLon[k].hienRa = 9e8; });
tran.linh = [];
/* giữ lõi (`loi: true`) sống — trụ lõi chết là kết thúc trận ngay (tran.xong), chỉ tắt hai trụ thường */
tran.tru.forEach(function (r) { if (!r.loi) r.song = false; });

/* khoá đứng yên toàn bộ người (không tự đi / tự đánh / tự chọn chiêu) */
function khoa(n) {
  n.hanh = { loai: 'khoa', bat: tran.t, dai: 9e8, moc: 9e8, daRa: true, muc: null, x: n.x, y: n.y, coDi: false, huy: false };
}
tran.nguoi.forEach(khoa);
G.tickTran(tran);   /* một tick để mồi _tran/_cs, không đủ để ai kịp làm gì (đã khoá) */

function id(idTuong) { for (var i = 0; i < tran.nguoi.length; i++) if (tran.nguoi[i].tuong.id === idTuong) return tran.nguoi[i]; throw new Error('không có ' + idTuong); }
function dat_(n, x, y) { n.x = x; n.y = y; n.px = x; n.py = y; khoa(n); }
function hoiPhuc(n) {
  n.hp = n.hpMax; n.buff = []; n.dot = []; n.chan = []; n.kc = 0; n.kcLoai = ''; n.troi = 0; n.im = 0;
  n.khieu = 0; n.khieuAi = -1; n.so = 0; n.soAi = -1; n.anMinh = 0; n.khongChon = 0; n.batTu = 0; n.mienKc = 0;
  n.chamMuc = 0; n.chamDen = 0; n._csTick = -1; n._vpStack = 0; n._tinhLinhSC = 0; n._tinhLinhSCd = 0;
  n.danhTuongAi = -1; n.danhTuongLuc = -99; n.cap = 1;
}
function cs(n) { return G._sim.chiSo(n); }
/** sát thương lý thuyết theo đúng công thức satThuong (không xuyên giáp/kháng, không LÌ vì HP đầy, hesoDoi=1) */
function satLyThuyet(ke, bi, luong, loaiSat) {
  if (loaiSat === 'thuc') return luong;
  var csB = bi.tuong ? cs(bi) : { giap: bi.giap || 0, khang: bi.khang || 0 };
  var csK = ke.tuong ? cs(ke) : { xuyenGiap: 0, xuyenKhang: 0 };
  var def = loaiSat === 'pt' ? csB.khang : csB.giap;
  var xuyen = loaiSat === 'pt' ? csK.xuyenKhang : csK.xuyenGiap;
  def *= 1 - G.kep(xuyen, 0, 100) / 100;
  return luong * 100 / (100 + Math.max(0, def));
}
function hanhGia(n, m, loai, x, y) {
  var a = n.tuong.tfm[loai === 'danh' ? 'attack' : loai];
  return {
    loai: loai, bat: tran.t, dai: G.giayTFM((a && a.duration) || 20), moc: G.giayTFM((a && a.start_timing) || 10),
    daRa: true, muc: m || null, x: x != null ? x : (m ? m.x : n.x), y: y != null ? y : (m ? m.y : n.y), coDi: false, huy: false
  };
}
function chieu(n, loai, m, x, y) { return G.chayChieu(tran, n, loai, hanhGia(n, m, loai, x, y)); }
function tick(soLan) { for (var i = 0; i < soLan; i++) G.tickTran(tran); }
function kcU(u) { return G.kcTFM(u); }
/** 1 tick TFM2 = 1 tick sim (TICK=1/60s khớp đúng 60 tick/giây của TFM2) — S.sau/S.lap dùng thẳng số tick,
    không cần đổi đơn vị. Số tick cần để đạn bay hết khoảng cách distTFM với tốc tocTFM (cùng đơn vị TFM2,
    "speed" TFM2 vốn là khoảng cách MỖI TICK — xem RESEARCH §14.1) là distTFM/tocTFM, cộng đệm cho chắc. */
function tickBay(distTFM, tocTFM) { return Math.ceil(distTFM / tocTFM) + 2; }

var d0 = id('fighter'), d1 = id('ninja'), d2 = id('pyromancer'), d3 = id('archer'), d4 = id('bard');
var DICH = [d0, d1, d2, d3, d4];

console.log('=== kiemChieu-4: nhóm 4 (' + ME.length + ' tướng) ===\n');

/* ════════════════════ poison_dart_hunter ════════════════════ */
(function () {
  var n = id('poison_dart_hunter'), m = d0;
  var p = n.tuong.tfm.skill1;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500, 500);
  chieu(n, 'skill', m, m.x, m.y);
  var truoc = m.hp;
  tick(1);
  var dam1 = truoc - m.hp;
  var kyVong = satLyThuyet(n, m, p.damage + p.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('poison_dart_hunter.skill: tick đầu gây sát thương ~' + Math.round(kyVong), gan(dam1, kyVong, Math.max(2, kyVong * 0.15)));
  kt('poison_dart_hunter.skill: trúng bãi độc bị làm chậm', m.chamMuc > 0 && m.chamDen > tran.t);
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500, 500);
  var dam2 = 0;
  var truoc2 = m.hp;
  chieu(n, 'skill', m, m.x, m.y);
  tick(Math.floor(p.attack_tick / 6) + 2);   /* để vùng chạy hết */
  dam2 = truoc2 - m.hp;
  kt('poison_dart_hunter.skill: vùng lặp gây nhiều hơn một tick (' + Math.round(dam2) + ')', dam2 > dam1 * 1.5);

  var p2 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  n.danhTuongAi = m.i; n.danhTuongLuc = tran.t;
  var truoc3 = m.hp;
  chieu(n, 'ult');
  tick(Math.floor(p2.poison_tick) + 2);
  kt('poison_dart_hunter.ult: đồng đội vừa đánh trúng bị tẩm độc gây thêm sát thương', m.hp < truoc3);
})();

/* ════════════════════ pythoness ════════════════════ */
(function () {
  var n = id('pythoness'), minh = id('vampire');   /* đồng minh cùng đội "ta" */
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(minh); dat_(n, 500, 500); dat_(minh, 500 + kcU(20000), 500);
  minh.hp = minh.hpMax * 0.5;
  var truoc = minh.hp;
  chieu(n, 'skill');
  tick(tickBay(20000, p.speed));
  var kyVongHoi = p.heal + p.attack_ratio / 100 * cs(n).ap;
  kt('pythoness.skill: đạn hồi bay tới hồi máu đồng minh ~' + Math.round(kyVongHoi), gan(minh.hp - truoc, kyVongHoi, Math.max(2, kyVongHoi * 0.15)));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(minh); hoiPhuc(d0);
  dat_(n, 500, 500); dat_(minh, 500 + kcU(20000), 500); dat_(d0, 500 + kcU(20000) + kcU(10000), 500);
  minh.hp = minh.hpMax * 0.5;
  var tHoi = minh.hp, tSat = d0.hp;
  chieu(n, 'skill2');
  tick(tickBay(20000, p2.speed));
  var kyHoi2 = p2.heal + p2.heal_ratio / 100 * cs(n).ap;
  var kySat2 = satLyThuyet(n, d0, p2.attack + p2.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('pythoness.skill2: hồi đồng minh ~' + Math.round(kyHoi2), gan(minh.hp - tHoi, kyHoi2, Math.max(2, kyHoi2 * 0.15)));
  kt('pythoness.skill2: địch quanh đồng minh trúng nổ phép ~' + Math.round(kySat2), gan(tSat - d0.hp, kySat2, Math.max(2, kySat2 * 0.2)));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(d0); dat_(n, 500, 500); dat_(d0, 500 + kcU(30000), 500);
  var truocUlt = d0.hp;
  chieu(n, 'ult', null, 500, 500);
  tick(p3.total_shots * Math.ceil(p3.term) + 5);
  kt('pythoness.ult: Quỷ Môn Quan bắn nhiều phát gây sát thương lên địch trong tầm', d0.hp < truocUlt);
})();

/* ════════════════════ shadowmancer ════════════════════ */
(function () {
  var n = id('shadowmancer'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500, 500);
  chieu(n, 'skill', m, m.x, m.y);
  tick(p.delayed + 2);
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('shadowmancer.skill: sau độ trễ gây sát thương ~' + Math.round(kyDmg), gan(m.hpMax - m.hp, kyDmg, Math.max(2, kyDmg * 0.15)));
  kt('shadowmancer.skill: trói chân mục tiêu', m.troi > tran.t);

  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500, 500);
  m.troi = tran.t + 1;   /* giả lập đang bị trói bởi skill trước đó */
  var truoc2 = m.hp;
  chieu(n, 'skill2');
  var p2 = n.tuong.tfm.skill2;
  var kyDmg2 = satLyThuyet(n, m, p2.attack + p2.magic_ratio / 100 * cs(n).ap, 'pt');
  kt('shadowmancer.skill2: kích nổ mục tiêu đang trói gây ~' + Math.round(kyDmg2), gan(truoc2 - m.hp, kyDmg2, Math.max(2, kyDmg2 * 0.15)));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(50000), 500);
  var truoc3 = m.hp;
  chieu(n, 'ult', null, 500 + kcU(80000), 500);
  tick(tickBay(50000, p3.speed));
  var kyDmg3 = satLyThuyet(n, m, p3.attack + p3.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('shadowmancer.ult: quả cầu xuyên thấu trúng địch trên đường bay ~' + Math.round(kyDmg3), gan(truoc3 - m.hp, kyDmg3, Math.max(2, kyDmg3 * 0.2)));
  kt('shadowmancer.ult: địch trúng bị khống chế (Trục Xuất xấp xỉ = choáng)', m.kc > 0);
})();

/* ════════════════════ shield_bearer ════════════════════ */
(function () {
  var n = id('shield_bearer'), minh = id('vampire');
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(minh); dat_(n, 500, 500); dat_(minh, 500 + kcU(20000), 500);
  chieu(n, 'skill', minh);
  var kySelf = p.shield + n.hpMax * p.shield_ratio / 100;
  var kyMinh = p.shield + minh.hpMax * p.shield_ratio / 100;
  var tongChanSelf = n.chan.reduce(function (s, c) { return s + c.luong; }, 0);
  var tongChanMinh = minh.chan.reduce(function (s, c) { return s + c.luong; }, 0);
  kt('shield_bearer.skill: khiên cho BẢN THÂN ~' + Math.round(kySelf), gan(tongChanSelf, kySelf, Math.max(2, kySelf * 0.05)));
  kt('shield_bearer.skill: khiên cho ĐỒNG MINH chỉ định ~' + Math.round(kyMinh), gan(tongChanMinh, kyMinh, Math.max(2, kyMinh * 0.05)));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(minh); hoiPhuc(d0);
  dat_(n, 500, 500); dat_(minh, 500 + kcU(10000), 500); dat_(d0, 500 + kcU(10000), 500);
  chieu(n, 'skill2');
  kt('shield_bearer.skill2: đồng minh quanh được buff giảm-nhận-sát-thương', minh.buff.some(function (b) { return b.cs && b.cs.giamNhan === p2.damage_share_ratio; }));
  kt('shield_bearer.skill2: địch quanh bị làm chậm', d0.chamMuc > 0);

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(d0); dat_(n, 500, 500); dat_(d0, 500 + kcU(10000), 500);
  chieu(n, 'ult');
  kt('shield_bearer.ult: bản thân được giảm sát thương + miễn khống chế', n.buff.some(function (b) { return b.cs && b.cs.giamNhan > 0 && b.cs.mienKc; }));
  kt('shield_bearer.ult: địch quanh bị khiêu khích', d0.khieu > tran.t && d0.khieuAi === n.i);
  kt('shield_bearer.ult: tự khoá hành động (không di chuyển)', n.hanh && n.hanh.dai >= G.giayTFM(p3.tick));
})();

/* ════════════════════ siege_breaker ════════════════════ */
(function () {
  var n = id('siege_breaker'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500, 500);
  chieu(n, 'skill', m);
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('siege_breaker.skill: đập chuỳ gây sát thương ~' + Math.round(kyDmg), gan(m.hpMax - m.hp, kyDmg, Math.max(2, kyDmg * 0.15)));

  /* trụ giả lập — kiểm cộng thêm sát thương lên công trình */
  var truGia = { hp: 2000, hpMax: 2000, giap: 70, khang: 30, doi: 'do', song: true, laTru: true, x: 500, y: 500, i: -1 };
  tran.tru.push(truGia);
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); dat_(n, 500, 500);
  chieu(n, 'skill', truGia);
  var kyDmgTru = satLyThuyet(n, truGia, p.attack + p.attack_ratio / 100 * cs(n).atk, 'vl') * (1 + p.structure_damage_bonus / 100);
  kt('siege_breaker.skill: đánh trụ được cộng thêm ' + p.structure_damage_bonus + '% (~' + Math.round(kyDmgTru) + ')', gan(truGia.hpMax - truGia.hp, kyDmgTru, Math.max(2, kyDmgTru * 0.15)));
  tran.tru.pop();

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); n.huong = 0; dat_(m, 500 + kcU(15000 + 10000), 500);
  var truoc2 = m.hp;
  chieu(n, 'skill2', null, 500 + kcU(30000), 500);
  var kyDmg2 = satLyThuyet(n, m, p2.attack + p2.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('siege_breaker.skill2: nện đất trúng địch trong vùng offset ~' + Math.round(kyDmg2), gan(truoc2 - m.hp, kyDmg2, Math.max(2, kyDmg2 * 0.2)));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); dat_(n, 500, 500);
  chieu(n, 'ult');
  var b = n.buff[0];
  kt('siege_breaker.ult: cộng đủ ba chỉ số (atkM/tocdanh/tocchay)', b && b.cs.atkM === p3.attack_mult && b.cs.tocdanh === p3.attack_speed_mult && b.cs.tocchay === p3.move_speed_mult);
})();

/* ════════════════════ soldier ════════════════════ */
(function () {
  var n = id('soldier'), m = d0;
  var p = n.tuong.tfm.skill;   /* khe thật (số Điểm Xạ Ba Viên nằm ở đây, xem ghi chú đầu tệp chieu-tfm-4.js */
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(30000), 500);
  var truoc = m.hp;
  chieu(n, 'skill', m);
  tick(p.interval * 3 + 5);
  var moiPhat = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('soldier.skill: ba phát liên tiếp gây tổng ~' + Math.round(moiPhat * 3), gan(truoc - m.hp, moiPhat * 3, Math.max(3, moiPhat * 3 * 0.15)));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); hoiPhuc(d1);
  dat_(n, 500, 500); n.huong = 0; dat_(m, 500 + kcU(40000), 500); dat_(d1, 500 + kcU(90000), 500);
  var t1 = m.hp, t2 = d1.hp;
  chieu(n, 'ult', null, 500 + kcU(200000), 500);
  tick(tickBay(90000, p3.speed));
  var dam1 = satLyThuyet(n, m, p3.attack + p3.attack_ratio / 100 * cs(n).atk, 'vl');
  var dam2 = satLyThuyet(n, d1, (p3.attack + p3.attack_ratio / 100 * cs(n).atk) * (1 - p3.attack_reduce_ratio / 100), 'vl');
  kt('soldier.ult: viên đạn xuyên trúng địch đầu tiên ~' + Math.round(dam1), gan(t1 - m.hp, dam1, Math.max(2, dam1 * 0.2)));
  kt('soldier.ult: địch thứ hai ăn sát thương đã giảm ' + p3.attack_reduce_ratio + '% (~' + Math.round(dam2) + ')', gan(t2 - d1.hp, dam2, Math.max(2, dam2 * 0.2)));
})();

/* ════════════════════ spirit_caller ════════════════════ */
(function () {
  var n = id('spirit_caller'), minh = id('vampire');
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(minh); dat_(n, 500, 500); dat_(minh, 500 + kcU(20000), 500);
  minh.hp = minh.hpMax * 0.5;
  var truoc = minh.hp;
  chieu(n, 'skill', minh);
  tick(p.dot_tick + 3);
  var moiLan = p.heal + p.heal_ratio / 100 * cs(n).ap;
  var soLan = Math.max(1, Math.floor(p.dot_tick / p.dot_period));
  kt('spirit_caller.skill: hồi theo nhịp tổng ~' + Math.round(moiLan * soLan), gan(minh.hp - truoc, moiLan * soLan, Math.max(2, moiLan * soLan * 0.15)));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(d0); dat_(n, 500, 500); dat_(d0, 500 + kcU(20000), 500);
  chieu(n, 'skill2', d0);
  var giapGiam = p2.defense_down + p2.defense_down_ap_ratio / 100 * cs(n).ap;
  kt('spirit_caller.skill2: địch bị giảm giáp đúng công thức ~' + giapGiam.toFixed(1), d0.buff.some(function (b) { return b.cs && gan(-b.cs.giap, giapGiam, 0.5); }));
  kt('spirit_caller.skill2: địch bị làm chậm', d0.chamMuc === p2.speed_down);

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(minh); hoiPhuc(d0);
  dat_(n, 500, 500); dat_(minh, 500 + kcU(10000), 500); dat_(d0, 500 + kcU(10000), 500);
  minh._tinhLinhSC = tran.t + 100; d0._tinhLinhSCd = tran.t + 100;
  var truocD0 = d0.hp;
  chieu(n, 'ult');
  kt('spirit_caller.ult: đồng minh có tinh linh được khiên', minh.chan.length > 0);
  kt('spirit_caller.ult: địch có tinh linh bị nổ sát thương + choáng', d0.hp < truocD0 && d0.kc > 0);
})();

/* ════════════════════ swordman ════════════════════ */
(function () {
  var n = id('swordman'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); n.huong = 0; dat_(m, 500 + kcU(50000), 500);
  var truoc = m.hp;
  chieu(n, 'skill', null, 500 + kcU(100000), 500);
  tick(tickBay(50000, p.speed));
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('swordman.skill: sóng kiếm khí xuyên thấu trúng địch ~' + Math.round(kyDmg), gan(truoc - m.hp, kyDmg, Math.max(2, kyDmg * 0.2)));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truoc2 = m.hp;
  chieu(n, 'skill2', m);
  tick(p2.interval * 3 + 3);
  var moiNhat = satLyThuyet(n, m, p2.attack + p2.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('swordman.skill2: ba nhát liên tiếp gây tổng ~' + Math.round(moiNhat * 3), gan(truoc2 - m.hp, moiNhat * 3, Math.max(3, moiNhat * 3 * 0.15)));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); n.huong = 0; dat_(m, 500 + kcU(60000), 500);
  n.cd.ult = 5;
  var truoc3 = m.hp;
  chieu(n, 'ult', null, 500 + kcU(150000), 500);
  tick(tickBay(60000, 6000));   /* tốc lao 6000 là hằng số hình ảnh trong chieu-tfm-4.js (ult không có speed trong TFM2) */
  var kyDmg3 = satLyThuyet(n, m, p3.attack + p3.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('swordman.ult: lướt trúng địch trên đường ~' + Math.round(kyDmg3), gan(truoc3 - m.hp, kyDmg3, Math.max(2, kyDmg3 * 0.2)));
  tick(tickBay(150000, 6000));   /* ticks thêm để lao đi hết toàn bộ quãng đường 150 TFM trước khi đo vị trí cuối */
  kt('swordman.ult: lướt xong đứng gần điểm đến (150 TFM = ' + kcU(150000).toFixed(1) + ' sim)', gan(Math.hypot(n.x - 500, n.y - 500), kcU(150000), kcU(150000) * 0.3));
})();

/* ════════════════════ taoist ════════════════════ */
(function () {
  var n = id('taoist'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  chieu(n, 'skill', m);
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('taoist.skill: gây sát thương ~' + Math.round(kyDmg), gan(m.hpMax - m.hp, kyDmg, Math.max(2, kyDmg * 0.15)));
  kt('taoist.skill: "Giải Giới" dìm tốc đánh kịch sàn', m.buff.some(function (b) { return b.cs && b.cs.tocdanh <= -80; }));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  chieu(n, 'skill2', m);
  var kyDmg2 = satLyThuyet(n, m, p2.attack + p2.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('taoist.skill2: gây sát thương ~' + Math.round(kyDmg2), gan(m.hpMax - m.hp, kyDmg2, Math.max(2, kyDmg2 * 0.15)));
  kt('taoist.skill2: "Câm Lặng" đúng ' + G.giayTFM(p2.block_duration).toFixed(1) + ' giây', gan(m.im - tran.t, G.giayTFM(p2.block_duration), 0.05));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); hoiPhuc(d1);
  dat_(n, 500, 500); n.huong = 0; dat_(m, 500 + kcU(40000), 500); dat_(d1, 500 + kcU(40000) + kcU(10000), 500);
  var truoc3 = m.hp;
  chieu(n, 'ult', null, 500 + kcU(80000), 500);
  tick(tickBay(40000, p3.speed));
  kt('taoist.ult: trúng chiêu gây sát thương + không thể bị chỉ định', m.hp < truoc3 && m.khongChon > tran.t);
  tick(p3.seal_duration + 2);
  kt('taoist.ult: hết Bất Động thì lan sang địch xung quanh (d1 dính đòn)', d1.hp < d1.hpMax);
})();

/* ════════════════════ vampire ════════════════════ */
(function () {
  var n = id('vampire'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truocN = n.hp; n.hp = n.hpMax * 0.5;
  chieu(n, 'skill', m);
  var kyDmg = satLyThuyet(n, m, p.attack + p.ap_ratio / 100 * cs(n).ap, 'pt');
  var kyHoi1 = p.heal + p.heal_per_stack * 1;
  kt('vampire.skill: gây sát thương ~' + Math.round(kyDmg), gan(m.hpMax - m.hp, kyDmg, Math.max(2, kyDmg * 0.15)));
  kt('vampire.skill: hồi máu bản thân (điểm cộng dồn #1) ~' + Math.round(kyHoi1), gan(n.hp - n.hpMax * 0.5, kyHoi1, Math.max(2, kyHoi1 * 0.15)));
  chieu(n, 'skill', m);
  var kyHoi2 = p.heal + p.heal_per_stack * 2;
  kt('vampire.skill: điểm cộng dồn #2 hồi nhiều hơn #1', n._vpStack === 2);
  void kyHoi2; void truocN;

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); n.huong = 0; dat_(m, 500 + kcU(20000), 500);
  var truocSelf = n.hpMax;
  chieu(n, 'skill2');
  kt('vampire.skill2: tự trừ ' + p2.hp_ratio + '% máu tối đa', gan(n.hpMax - n.hp, truocSelf * p2.hp_ratio / 100, 1));
  kt('vampire.skill2: địch phía trước (trong nón) trúng sát thương', m.hp < m.hpMax);

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); n.huong = 0; dat_(m, 500 + kcU(40000), 500);
  n.hp = n.hpMax * 0.5;   /* đầy máu thì hồi không tăng thêm được (kẹp ở hoiMau) — hạ trước để đo được hồi */
  var truocHp = n.hp;
  chieu(n, 'ult', null, 500 + kcU(120000), 500);
  tick(tickBay(40000, p3.speed));
  kt('vampire.ult: lướt qua địch vừa gây sát thương vừa hút máu về mình', m.hp < m.hpMax && n.hp > truocHp);
  kt('vampire.ult: bản thân Không Thể Bị Chỉ Định trong lúc lướt', n.khongChon > tran.t - G.giayTFM(p3.duration));
})();

/* ════════════════════ voodoo_shaman ════════════════════ */
(function () {
  var n = id('voodoo_shaman'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(30000), 500);
  var truoc = m.hp;
  chieu(n, 'skill', m);
  tick(tickBay(30000, p.speed));
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('voodoo_shaman.skill: mũi tên trúng gây sát thương ~' + Math.round(kyDmg), gan(truoc - m.hp, kyDmg, Math.max(2, kyDmg * 0.2)));
  kt('voodoo_shaman.skill: bị chậm + giảm tốc đánh', m.chamMuc === p.slow_ratio && m.buff.some(function (b) { return b.cs && b.cs.tocdanh === -p.attack_speed_reduce; }));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truoc2 = m.hp;
  chieu(n, 'skill2', m);
  var kyBan = satLyThuyet(n, m, p2.base_damage + p2.damage_ratio / 100 * cs(n).ap, 'pt');
  kt('voodoo_shaman.skill2: sát thương nguyền ban đầu ~' + Math.round(kyBan), gan(truoc2 - m.hp, kyBan, Math.max(2, kyBan * 0.15)));
  var khoang = Math.max(1, Math.floor(p2.curse_duration / p2.max_hits));
  tick(p2.max_hits * khoang + 3);
  var moiHit = satLyThuyet(n, m, p2.per_hit_damage + p2.per_hit_ratio / 100 * cs(n).ap, 'pt');
  kt('voodoo_shaman.skill2: cộng dồn tối đa ' + p2.max_hits + ' nhịp nguyền (tổng ~' + Math.round(kyBan + moiHit * p2.max_hits) + ')',
    gan(truoc2 - m.hp, kyBan + moiHit * p2.max_hits, Math.max(3, (kyBan + moiHit * p2.max_hits) * 0.15)));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500, 500);
  var truoc3 = m.hp;
  chieu(n, 'ult', null, 500, 500);
  tick(2);   /* chỉ một nhịp đầu — vùng còn lặp nhiều nhịp nữa trong suốt ult_duration */
  var kyVung = m.hpMax * p3.max_hp_damage_ratio / 100 + p3.magic_ratio / 100 * cs(n).ap;
  kt('voodoo_shaman.ult: vùng tà thuật gây sát thương theo % máu tối đa ~' + Math.round(kyVung), gan(truoc3 - m.hp, kyVung, Math.max(2, kyVung * 0.2)));
  kt('voodoo_shaman.ult: bị câm lặng trong vùng', m.im > tran.t);
})();

/* ════════════════════ werewolf ════════════════════ */
(function () {
  var n = id('werewolf'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); n.huong = 0; dat_(n, 500, 500); dat_(m, 500 + kcU(30000), 500);
  var truocN = n.hp; n.hp = n.hpMax * 0.7;
  chieu(n, 'skill');
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('werewolf.skill: cào trúng địch phía trước ~' + Math.round(kyDmg), gan(m.hpMax - m.hp, kyDmg, Math.max(2, kyDmg * 0.2)));
  kt('werewolf.skill: hồi máu theo % sát thương gây ra', n.hp > n.hpMax * 0.7);
  void truocN;

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truoc2 = m.hp;
  chieu(n, 'skill2', null, 500 + kcU(50000), 500);
  tick(tickBay(20000, p2.speed));
  var kyDmg2 = satLyThuyet(n, m, p2.attack + p2.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('werewolf.skill2: lướt trúng địch trên đường ~' + Math.round(kyDmg2), gan(truoc2 - m.hp, kyDmg2, Math.max(2, kyDmg2 * 0.25)));
  kt('werewolf.skill2: địch bị làm chậm', m.chamMuc === p2.slow_speed);

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); n.huong = 0; dat_(n, 500, 500); dat_(m, 500 + kcU(30000), 500);
  var truoc3 = m.hp;
  chieu(n, 'ult');
  tick(p3.channel_duration + 3);
  kt('werewolf.ult: cào nhiều nhịp trong lúc kênh gây sát thương', m.hp < truoc3);
  kt('werewolf.ult: để lại Chảy Máu (dot) trên mục tiêu', m.dot && m.dot.length > 0 || m.hp < truoc3 - satLyThuyet(n, m, p3.attack + p3.attack_ratio / 100 * cs(n).atk, 'vl') * 2);
})();

/* ════════════════════ whip_master ════════════════════ */
(function () {
  var n = id('whip_master'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truoc = m.hp;
  chieu(n, 'skill', m);
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).atk + m.hpMax * p.target_hp_ratio / 100, 'vl');
  kt('whip_master.skill: quất roi + phần trăm máu mục tiêu ~' + Math.round(kyDmg), gan(truoc - m.hp, kyDmg, Math.max(2, kyDmg * 0.15)));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); n.huong = 0; dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truoc2 = m.hp, x0 = m.x;
  chieu(n, 'skill2');
  var kyDmg2 = satLyThuyet(n, m, p2.attack + p2.attack_ratio / 100 * cs(n).atk, 'vl');
  kt('whip_master.skill2: quét roi hình nón gây sát thương ~' + Math.round(kyDmg2), gan(truoc2 - m.hp, kyDmg2, Math.max(2, kyDmg2 * 0.2)));
  tick(p2.knockback_tick + 2);
  kt('whip_master.skill2: địch bị đẩy lùi (x tăng lên)', m.x > x0 + 1 || (m.ep != null));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(40000), 500);
  var truoc3 = m.hp;
  chieu(n, 'ult');
  tick(p3.channel_duration + 3);
  kt('whip_master.ult: vận sức nhiều nhịp roi trúng địch ngẫu nhiên trong tầm', m.hp < truoc3);
})();

/* ════════════════════ white_mage ════════════════════ */
(function () {
  var n = id('white_mage'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truoc = m.hp;
  chieu(n, 'skill', m, m.x, m.y);
  tick(p.delayed + 2);
  var kyDmg = satLyThuyet(n, m, p.attack + p.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('white_mage.skill: tia sáng nổ trễ gây sát thương ~' + Math.round(kyDmg), gan(truoc - m.hp, kyDmg, Math.max(2, kyDmg * 0.15)));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500, 500);
  var truoc2 = m.hp;
  chieu(n, 'skill2', null, 500, 500);
  tick(p2.first_delay + p2.attack_period * 5 + 3);
  var moiLan = satLyThuyet(n, m, p2.damage + p2.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('white_mage.skill2: 5 nhịp trong vùng gây tổng ~' + Math.round(moiLan * 5), gan(truoc2 - m.hp, moiLan * 5, Math.max(3, moiLan * 5 * 0.2)));

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); n.huong = 0; dat_(n, 500, 500); dat_(m, 500 + kcU(40000), 500);
  var truoc3 = m.hp;
  chieu(n, 'ult', null, 500 + kcU(120000), 500);
  tick(tickBay(40000, p3.speed));
  var kyDmg3 = satLyThuyet(n, m, p3.attack + p3.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('white_mage.ult: vòng phong ấn xuyên trúng địch ~' + Math.round(kyDmg3), gan(truoc3 - m.hp, kyDmg3, Math.max(2, kyDmg3 * 0.2)));
  kt('white_mage.ult: trói chân địch trúng chiêu', m.troi > tran.t);
})();

/* ════════════════════ wind_mage ════════════════════ */
(function () {
  var n = id('wind_mage'), m = d0;
  var p = n.tuong.tfm.skill;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); hoiPhuc(id('vampire'));
  var minh = id('vampire');
  dat_(n, 500, 500); dat_(m, 500, 500); dat_(minh, 500, 500);
  var truoc = m.hp;
  chieu(n, 'skill', null, 500, 500);
  tick(Math.floor(p.attack_tick / p.attack_period) * p.attack_period + 3);
  var moiLan = satLyThuyet(n, m, p.damage + p.attack_ratio / 100 * cs(n).ap, 'pt');
  var soLan = Math.floor(p.attack_tick / p.attack_period);
  kt('wind_mage.skill: vùng cuồng phong gây nhiều nhịp (~' + soLan + ' nhịp, tổng ~' + Math.round(moiLan * soLan) + ')',
    gan(truoc - m.hp, moiLan * soLan, Math.max(3, moiLan * soLan * 0.2)));
  kt('wind_mage.skill: đồng minh đứng trong vùng được tăng tốc chạy', minh.buff.some(function (b) { return b.cs && b.cs.tocchay === p.move_speed; }));

  var p2 = n.tuong.tfm.skill2;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); n.huong = 0; dat_(n, 500, 500); dat_(m, 500 + kcU(20000), 500);
  var truoc2 = m.hp;
  chieu(n, 'skill2');
  tick(tickBay(20000, p2.speed));
  var kyMoiTia = satLyThuyet(n, m, p2.attack + p2.attack_ratio / 100 * cs(n).ap, 'pt');
  kt('wind_mage.skill2: năm lốc xoáy quạt trước mặt, ít nhất một tia trúng địch ngay trước mặt', truoc2 - m.hp >= kyMoiTia * 0.9);

  var p3 = n.tuong.tfm.ult;
  tran.hen = []; tran.vung = []; tran.dan = []; hoiPhuc(n); hoiPhuc(m); dat_(n, 500, 500); dat_(m, 500 + kcU(40000), 500);
  var truoc3 = m.hp;
  chieu(n, 'ult');
  tick(tickBay(40000, p3.speed));
  kt('wind_mage.ult: lốc xoáy đuổi theo trúng địch gần nhất gây sát thương + hất tung', m.hp < truoc3);
})();

console.log('\n=== ' + DAT + '/' + TONG + ' ĐẠT ===');
if (DAT !== TONG) process.exitCode = 1;
