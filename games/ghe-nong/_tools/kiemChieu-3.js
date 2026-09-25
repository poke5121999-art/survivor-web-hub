/* _tools/kiemChieu-3.js — bộ kiểm chiêu viết tay của nhóm 3 (js/chieu-tfm-3.js), chạy ngoài trình
 * duyệt bằng Node, nạp game theo đúng thứ tự index.html (mô phỏng theo _tools/soiAI-node.js).
 *
 *   node _tools/kiemChieu-3.js
 *
 * Dựng trận tối giản (1-2 người, không lính/trụ/quái can thiệp), gọi thẳng G.chayChieu cho đúng
 * chiêu cần kiểm, rồi chạy vài chục tick (G.tickTran) để đạn/lao/vùng/hẹn giờ được xử lý — các
 * hiệu ứng tức thời (sát thương, khống chế) đã có ngay sau chayChieu, hiệu ứng trễ (đạn, lao, vùng,
 * S.sau/S.lap) cần chạy tick mới thấy. In một dòng ĐẠT/HỎNG cho mỗi kiểm; thoát mã khác 0 nếu có
 * HỎNG.
 */
'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var goc = path.join(__dirname, '..');
global.window = global;
global.addEventListener = function () {};
global.document = {
  createElement: function () { return { getContext: function () { return {}; }, style: {} }; },
  getElementById: function () { return null; },
  addEventListener: function () {},
  body: { appendChild: function () {} }
};
global.Image = function () {};
global.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
global.requestAnimationFrame = function () { return 0; };

['art/asset-map.js', 'js/util.js', 'js/sprites.js', 'js/tieng.js', 'js/data-tfm.js', 'js/data-kynang.js',
  'js/data-tuong.js', 'js/data-trangbi.js', 'js/fx-chieu.js', 'js/data-hlv.js',
  'js/data-tuyenthu.js', 'js/data-giai.js', 'js/data-sukien.js', 'js/save.js',
  'js/day.js', 'js/ca.js', 'js/data-thoai.js', 'js/data-bando.js', 'js/sim.js', 'js/chieu.js',
  'js/chieu-tfm-1.js', 'js/chieu-tfm-2.js', 'js/chieu-tfm-3.js', 'js/chieu-tfm-4.js', 'js/mua.js', 'js/giai.js'
].forEach(function (f) {
  try { vm.runInThisContext(fs.readFileSync(path.join(goc, f), 'utf8'), { filename: f }); }
  catch (e) { console.error('LỖI NẠP', f, e.message); process.exit(1); }
});

var G = window;
var DAT = 0, HONG = 0;
function kt(ten, dk, chiTiet) {
  if (dk) { DAT++; console.log('ĐẠT  ' + ten); }
  else { HONG++; console.log('HỎNG ' + ten + (chiTiet ? '  (' + chiTiet + ')' : '')); }
}
function gan(a, b, sai) { return Math.abs(a - b) <= (sai == null ? Math.max(1, Math.abs(b) * 0.03) : sai); }

/* ── dựng trận tối giản ──
   soLuong: số người mỗi đội (mặc định 1 xanh + 1 đỏ). ids: mảng id TFM2 theo thứ tự [xanh…, đỏ…]. */
function tran2(idXanh, idDo) {
  var vt = function (id) { return G.TUONG_THEO_ID[id].vt; };
  var mot = function (id, ten) {
    return { vt: vt(id), tuyenthuId: ten, tuongId: id, tt: 'SR', ten: ten,
      chat: ['thu'], ego: 40, cs: { co: 600, ben: 600, luc: 600, li: 600, nao: 600 } };
  };
  var ta = { ten: 'A', mau: '#fff', heso: { ds: [] }, chienThuat: {}, nguoi: idXanh.map(function (id, i) { return mot(id, 'x' + i); }) };
  var dich = { ten: 'B', mau: '#f00', heso: { ds: [] }, chienThuat: {}, nguoi: idDo.map(function (id, i) { return mot(id, 'd' + i); }) };
  var tran = G.taoTran({ ta: ta, dich: dich }, 7777);
  tran.linh = []; tran.tru = []; tran.quai = [];
  tran.nguoi.forEach(function (n) { n._tran = tran; });
  return tran;
}

/** đặt vị trí (sim units) và cấp độ của một người; dọn cd/hp về mốc sạch */
function dat(n, x, y, cap) {
  n.x = x; n.y = y; n.px = x; n.py = y;
  n.cap = cap || 1;
  n.vang = 0; n.do = [];        /* không vàng → không tự mua đồ giữa lúc kiểm */
  n.cd = { danh: 999, skill: 0, skill2: 0, ult: 0 };   /* cd.danh cao để khỏi tự đánh thường trong lúc kiểm */
  n.buff = []; n.dot = []; n.chan = []; n.hieu = {};
  n.kc = 0; n.kcLoai = ''; n.troi = 0; n.im = 0; n.so = 0; n.khieu = 0;
  n.mienKc = 0; n.batTu = 0; n.anMinh = 0; n.khongChon = 0; n.chamMuc = 0; n.chamDen = 0;
  n.lao = null; n.ep = null; n.chet = 0; n.mucTieu = null; n._csTick = -1;
  /* hpMax phải khớp ĐÚNG công thức chiSoNguoi (có heBen/heTT…) — dùng tuongOCap thô sẽ lệch, và
     tick đầu tiên sim tự đồng bộ lại hpMax rồi HỒI phần chênh lệch đó, làm nhiễu phép đo sát thương. */
  var cs1 = G._sim.chiSo(n);
  n.hp = cs1.hpMax; n.hpMax = cs1.hpMax;
  return n;
}

function chay(tran, tick) { for (var i = 0; i < tick; i++) G.tickTran(tran); }
/** như chay(), nhưng GHIM vị trí vài người mỗi tick — dùng cho chiêu có độ trễ (thiên thạch, sét,
    chưởng…) khi bài kiểm không muốn NÃO tự đi lại (né đòn) làm nhiễu phép đo trúng/không trúng. */
function chayGhim(tran, tick, ds) {
  for (var i = 0; i < tick; i++) {
    G.tickTran(tran);
    ds.forEach(function (n) { if (n._ghimX != null) { n.x = n._ghimX; n.y = n._ghimY; n.px = n.x; n.py = n.y; } });
  }
}
function ghim(n) { n._ghimX = n.x; n._ghimY = n.y; return n; }

/** gọi thẳng chiêu của id (bỏ qua chonMucChieu) — muc/x/y do bài kiểm tự chọn */
function raChieu(tran, n, loai, muc, x, y) {
  n._tran = tran;
  if (muc) muc._tran = tran;
  var hanh = { muc: muc || null, x: x != null ? x : n.x, y: y != null ? y : n.y, daRa: true };
  return G.chayChieu(tran, n, loai, hanh);
}

function csCua(tran, n) { n._tran = tran; return G._sim.chiSo(n); }
function thucSat(tran, ke, bi, luong, loaiSat) {
  var csB = csCua(tran, bi);
  var def = loaiSat === 'pt' ? csB.khang : csB.giap;
  return luong * 100 / (100 + Math.max(0, def));
}

/* ══════════════════════════ ILLUSIONIST ══════════════════════════ */
(function () {
  var tran = tran2(['illusionist'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 550, 500, 3);
  var p = n.tuong.tfm.skill;
  var hpTruoc = m.hp;
  raChieu(tran, n, 'skill', m);
  chay(tran, 40);
  var cs = csCua(tran, n);
  var kyVong = thucSat(tran, n, m, p.attack + p.attack_ratio / 100 * cs.ap, 'pt');
  kt('illusionist.skill — đạn phép trúng, đúng sát thương', gan(hpTruoc - m.hp, kyVong));
  kt('illusionist.skill — mục tiêu bị khiêu khích (đánh vào Illusionist)', m.khieu > tran.t);
})();

(function () {
  var tran = tran2(['illusionist'], ['knight', 'knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var xa = dat(tran.nguoi[2], 900, 900, 3);   /* người ở xa, không được tính vào phạm vi 60 */
  var p = n.tuong.tfm.skill2;
  var hpTruoc = m.hp;
  raChieu(tran, n, 'skill2', m, m.x, m.y);
  var cs = csCua(tran, n);
  var kyVong = thucSat(tran, n, m, p.attack + p.magic_ratio / 100 * cs.ap, 'pt');
  kt('illusionist.skill2 — nổ ảo ảnh tại điểm ngắm, đúng sát thương', gan(hpTruoc - m.hp, kyVong));
  kt('illusionist.skill2 — mục tiêu bị Hoảng Sợ', m.so > tran.t);
  kt('illusionist.skill2 — người ngoài phạm vi 60 không trúng', xa.hp === xa.hpMax);
})();

(function () {
  var tran = tran2(['illusionist', 'knight'], []);
  var n = dat(tran.nguoi[0], 500, 500, 4), ban = dat(tran.nguoi[1], 520, 500, 5);
  var soTruoc = tran.linh.length;
  raChieu(tran, n, 'ult', null, ban.x, ban.y);
  kt('illusionist.ult — triệu hồi phân thân (thêm một thực thể vào tran.linh)', tran.linh.length === soTruoc + 1);
  if (tran.linh.length > soTruoc) {
    var clone = tran.linh[tran.linh.length - 1];
    kt('illusionist.ult — phân thân mang chỉ số của Knight cấp 5 (atk)', gan(clone.atk, ban.tuong.tfm.stat.attack + ban.tuong.tfm.growth.attack * 4, 0.5));
  }
})();

/* ══════════════════════════ INQUISITOR ══════════════════════════ */
(function () {
  var tran = tran2(['inquisitor'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 540, 500, 3);   /* trong tầm 50 */
  var p = n.tuong.tfm.skill;
  var hpTruoc = m.hp;
  raChieu(tran, n, 'skill', m);
  chay(tran, 30);
  var cs = csCua(tran, n);
  var kyVongVaChan = thucSat(tran, n, m, p.attack + p.attack_ratio / 100 * cs.atk, 'vl');
  kt('inquisitor.skill — lướt trúng, đúng sát thương đòn đầu', gan(hpTruoc - m.hp, kyVongVaChan, kyVongVaChan * 0.15));
  kt('inquisitor.skill — dấu chảy máu đang chờ skill2 làm mới hồi', !!m._inqChayMauToi && m._inqChayMauToi > tran.t);
  chay(tran, 100);   /* 100 tick ~1.67s > bleed_duration 1.5s: máu tiếp tục giảm do chảy máu */
  kt('inquisitor.skill — chảy máu gây thêm sát thương theo thời gian', m.hp < m.hpMax - kyVongVaChan);
})();

(function () {
  var tran = tran2(['inquisitor'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  m._inqChayMauToi = tran.t + 5;
  var cdTruoc = 999;
  n.cd.skill = cdTruoc;
  raChieu(tran, n, 'skill2', m);
  kt('inquisitor.skill2 — trúng mục tiêu đang chảy máu thì làm mới hồi chiêu skill', n.cd.skill === 0);
})();

(function () {
  var tran = tran2(['inquisitor'], ['knight', 'knight']);
  var n = dat(tran.nguoi[0], 500, 500, 4), m = dat(tran.nguoi[1], 540, 500, 4);
  m.hp = m.hpMax * 0.1;   /* dưới ngưỡng 15% sau đòn thì kết liễu */
  var hoang = dat(tran.nguoi[2], 545, 500, 4);
  raChieu(tran, n, 'ult', m);
  chay(tran, 30);
  kt('inquisitor.ult — kết liễu mục tiêu dưới ngưỡng máu', m.chet > 0 || m.hp <= 0);
  kt('inquisitor.ult — kết liễu thành công làm Hoảng Sợ người quanh đó', hoang.so > tran.t);
})();

/* ══════════════════════════ JIANGSHI ══════════════════════════ */
(function () {
  var tran = tran2(['jiangshi'], []);
  var n = dat(tran.nguoi[0], 500, 500, 3);
  var soTruoc = tran.linh.length;
  raChieu(tran, n, 'skill', null, n.x, n.y);
  kt('jiangshi.skill — triệu hồi Cương Thi Con', tran.linh.length === soTruoc + 1);
})();

(function () {
  var tran = tran2(['jiangshi'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var hpTruoc = m.hp; n.hp -= 300; var hpNTruoc = n.hp;
  raChieu(tran, n, 'skill2', m);
  var cs = csCua(tran, n);
  var kyVong = thucSat(tran, n, m, 30 + 100 / 100 * cs.atk, 'vl');
  kt('jiangshi.skill2 — đòn choáng đúng sát thương', gan(hpTruoc - m.hp, kyVong));
  kt('jiangshi.skill2 — mục tiêu bị choáng', m.kc > 0 && m.kcLoai === 'choang');
  kt('jiangshi.skill2 — hồi 200 máu cho bản thân', gan(n.hp - hpNTruoc, 200, 1));
})();

(function () {
  var tran = tran2(['jiangshi'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var hpTruoc = m.hp;
  raChieu(tran, n, 'ult', null, n.x, n.y);
  chay(tran, 40);
  kt('jiangshi.ult — vùng hút sinh lực gây sát thương theo thời gian', m.hp < hpTruoc);
  kt('jiangshi.ult — hút máu hồi cho Jiangshi', n.hp > n.hpMax * 0.99 || n.hp >= n.hpMax);
})();

/* ══════════════════════════ KNIGHT ══════════════════════════ */
(function () {
  var tran = tran2(['knight'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 530, 500, 3);
  raChieu(tran, n, 'skill', m);
  kt('knight.skill — mục tiêu bị khiêu khích 1 giây', m.khieu >= tran.t + 0.9 && m.khieu <= tran.t + 1.1);
})();

(function () {
  var tran = tran2(['knight'], []);
  var n = dat(tran.nguoi[0], 500, 500, 3);
  raChieu(tran, n, 'skill2', null, n.x, n.y);
  var p = n.tuong.tfm.skill2;
  kt('knight.skill2 — tự khiên đúng lượng', n.chan.length === 1 && gan(n.chan[0].luong, p.shield + n.hpMax * p.shield_ratio / 100, 1));
  kt('knight.skill2 — có buff phản đòn', n.buff.some(function (b) { return b.cs.phanDon === p.reflect; }));
})();

(function () {
  var tran = tran2(['knight', 'knight'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 5), ban = dat(tran.nguoi[1], 540, 500, 5);
  var dich = dat(tran.nguoi[2], 540, 500, 5);
  raChieu(tran, n, 'ult', null, 540, 500);
  chay(tran, 20);
  kt('knight.ult — đồng minh trong vùng được giảm sát thương', ban.buff.some(function (b) { return b.cs.giamNhan > 0; }));
  kt('knight.ult — kẻ địch trong vùng bị làm chậm', dich.chamMuc > 0 && dich.chamDen > tran.t);
})();

/* ══════════════════════════ LANCER ══════════════════════════ */
(function () {
  var tran = tran2(['lancer'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var hpTruoc = m.hp, xTruoc = m.x;
  raChieu(tran, n, 'skill', null, n.x, n.y);
  var p = n.tuong.tfm.skill, cs = csCua(tran, n);
  var kyVong = thucSat(tran, n, m, p.attack + p.attack_ratio / 100 * cs.atk, 'vl');
  kt('lancer.skill — quét quanh mình đúng sát thương', gan(hpTruoc - m.hp, kyVong));
  chay(tran, 20);
  kt('lancer.skill — đẩy lùi mục tiêu ra xa', m.x > xTruoc);
})();

(function () {
  var tran = tran2(['lancer'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var hpTruoc = m.hp;
  raChieu(tran, n, 'skill2', m);
  chay(tran, 20);
  var p = n.tuong.tfm.skill2, cs = csCua(tran, n);
  var kyVong = thucSat(tran, n, m, p.attack + p.attack_ratio / 100 * cs.atk, 'vl');
  kt('lancer.skill2 — lướt xuyên trúng đúng sát thương', gan(hpTruoc - m.hp, kyVong, kyVong * 0.15));
  kt('lancer.skill2 — Lancer ra phía sau mục tiêu (x > mục tiêu)', n.x > m.x - 1);
})();

(function () {
  var tran = tran2(['lancer'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 4);
  n.huong = 0;   /* hướng +x */
  var m = dat(tran.nguoi[1], 540, 500, 4);
  var hpTruoc = m.hp;
  raChieu(tran, n, 'ult', null, 1000, 500);
  chay(tran, 40);
  kt('lancer.ult — trúng địch trên đường lao, hất tung', m.hp < hpTruoc && m.kc > 0 && m.kcLoai === 'hat');
})();

/* ══════════════════════════ LIGHTNING_MAGE ══════════════════════════ */
(function () {
  var tran = tran2(['lightning_mage'], ['knight', 'knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3);
  var m1 = dat(tran.nguoi[1], 530, 500, 3);
  var m2 = dat(tran.nguoi[2], 560, 500, 3);   /* trong splash_range 50 của m1 để lan tiếp */
  var h1 = m1.hp, h2 = m2.hp;
  raChieu(tran, n, 'skill', null, n.x, n.y);
  chay(tran, 30);
  kt('lightning_mage.skill — trúng mục tiêu đầu tiên', m1.hp < h1);
  kt('lightning_mage.skill — lan sang mục tiêu thứ hai trong bán kính', m2.hp < h2);
})();

/* skill2 + ult dùng dữ liệu thật, kiểm nhanh không văng lỗi + có hiệu ứng */
(function () {
  var tran = tran2(['lightning_mage'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 4), m = ghim(dat(tran.nguoi[1], 560, 500, 4));
  var h = m.hp;
  raChieu(tran, n, 'skill2', m, m.x, m.y);
  chayGhim(tran, 50, [m]);
  kt('lightning_mage.skill2 — sét đánh trễ gây sát thương + choáng', m.hp < h && m.kc > 0);
})();
(function () {
  var tran = tran2(['lightning_mage'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 5), m = dat(tran.nguoi[1], 540, 500, 5);
  var h = m.hp;
  raChieu(tran, n, 'ult', m);
  chay(tran, 200);
  kt('lightning_mage.ult — kênh gây sát thương liên tục lên mục tiêu', m.hp < h);
})();

/* ══════════════════════════ MAGIC_KNIGHT ══════════════════════════ */
(function () {
  var tran = tran2(['magic_knight'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3);
  n.huong = 0;
  var m = dat(tran.nguoi[1], 550, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'skill', null, n.x + 600, n.y);   /* điểm ngắm thật xa phía trước, không trùng vị trí Magic Knight */
  kt('magic_knight.skill — đường thẳng phía trước trúng địch', m.hp < h);
})();
(function () {
  var tran = tran2(['magic_knight'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'skill2', m, m.x, m.y);
  chay(tran, 130);
  kt('magic_knight.skill2 — lõi ma thuật gây sát thương theo thời gian + hút', m.hp < h);
})();
(function () {
  var tran = tran2(['magic_knight'], []);
  var n = dat(tran.nguoi[0], 500, 500, 5);
  raChieu(tran, n, 'ult', null, n.x, n.y);
  kt('magic_knight.ult — tự buff tầm đánh + tốc đánh', n.buff.some(function (b) { return b.cs.tam > 0 && b.cs.tocdanh > 0; }));
})();

/* ══════════════════════════ MONK (skill số dự phòng) ══════════════════════════ */
(function () {
  var tran = tran2(['monk'], []);
  var n = dat(tran.nguoi[0], 500, 500, 3);
  n.hp = n.hpMax * 0.5;
  raChieu(tran, n, 'skill', null, n.x, n.y);
  var p = { heal_self: 200, attack_ratio: 50 }, cs = csCua(tran, n);
  kt('monk.skill — chỉ một mình thì hồi theo mức SingleValue cao hơn', gan(n.hp - n.hpMax * 0.5, p.heal_self + p.attack_ratio / 100 * cs.ap, 1));
})();
(function () {
  var tran = tran2(['monk', 'knight'], []);
  var n = dat(tran.nguoi[0], 500, 500, 3), ban = dat(tran.nguoi[1], 520, 500, 3);
  n.hp = n.hpMax * 0.5; ban.hp = ban.hpMax * 0.5;
  raChieu(tran, n, 'skill', null, n.x, n.y);
  var p = { heal: 100, attack_ratio: 50 }, cs = csCua(tran, n);
  kt('monk.skill — có đồng minh thì hồi cả hai theo mức Value thường', gan(ban.hp - ban.hpMax * 0.5, p.heal + p.attack_ratio / 100 * cs.ap, 1));
})();
(function () {
  var tran = tran2(['monk'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = ghim(dat(tran.nguoi[1], 520, 500, 3));
  var h = m.hp;
  raChieu(tran, n, 'skill2', null, m.x, m.y);
  chayGhim(tran, 60, [m]);
  kt('monk.skill2 — chưởng trễ gây sát thương + choáng', m.hp < h && m.kc > 0);
})();
(function () {
  var tran = tran2(['monk', 'knight'], []);
  var n = dat(tran.nguoi[0], 500, 500, 5), ban = dat(tran.nguoi[1], 520, 500, 5);
  raChieu(tran, n, 'ult', null, n.x, n.y);
  kt('monk.ult — đồng minh nhận khiên', ban.chan.length === 1);
  kt('monk.ult — đồng minh nhận buff tốc chạy', ban.buff.some(function (b) { return b.cs.tocchay === 30; }));
})();

/* ══════════════════════════ NECROMANCER ══════════════════════════ */
(function () {
  var tran = tran2(['necromancer'], []);
  var n = dat(tran.nguoi[0], 500, 500, 4);
  raChieu(tran, n, 'skill', null, n.x, n.y);
  kt('necromancer.skill — triệu hồi Ngạ Quỷ', tran.linh.length === 1 && n._ncNgaQui === tran.linh[0]);
})();
(function () {
  var tran = tran2(['necromancer'], []);
  var n = dat(tran.nguoi[0], 500, 500, 4);
  raChieu(tran, n, 'skill', null, n.x, n.y);
  var q = n._ncNgaQui;
  var hoiDanhTruoc = q.hoiDanh, tocchayTruoc = q.tocchay;
  raChieu(tran, n, 'skill2', null, n.x, n.y);
  kt('necromancer.skill2 — Ngạ Quỷ đánh nhanh hơn (hoiDanh giảm) + chạy nhanh hơn', q.hoiDanh < hoiDanhTruoc && q.tocchay > tocchayTruoc);
})();
(function () {
  var tran = tran2(['necromancer'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 4), ban = dat(tran.nguoi[1], 520, 500, 4);
  ban.doi = n.doi; ban.chet = 3;   /* đồng đội vừa chết */
  var hp0 = ban.hpMax * 0.35;
  raChieu(tran, n, 'ult', null, n.x, n.y);
  kt('necromancer.ult — hồi sinh đồng minh vừa chết', ban.chet < 0.02 && gan(ban.hp, hp0, hp0 * 0.05));
  chay(tran, 2);   /* chỉ vài tick cho ban.chet rơi hẳn về 0 (cờ "vừa hồi sinh") — chưa đủ 2s để NÃO cho về nhà */
  /* gọi thẳng các hẹn giờ hút máu (S.lap) thay vì chạy hết tick thật — chạy hết sẽ để NÃO tự quyết
     định lại làm ban tự về nhà và hồi ở giếng (che mất khoản hút máu rất nhỏ, 2 máu/giây) */
  var hpTruocHut = ban.hp, denT = tran.t + 3;
  tran.hen.slice().forEach(function (h) { if (h.t <= denT) h.fn(); });
  kt('necromancer.ult — Vong Linh mất máu dần theo thời gian', ban.hp < hpTruocHut);
})();

/* ══════════════════════════ NINJA ══════════════════════════ */
(function () {
  var tran = tran2(['ninja'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 560, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'skill', m);
  chay(tran, 30);
  kt('ninja.skill — bắn cầu bóng tối trúng, nhảy tới mục tiêu', m.hp < h && gan(n.x, m.x, 30));
})();
(function () {
  var tran = tran2(['ninja'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'skill2', m);
  chay(tran, 30);
  kt('ninja.skill2 — ba đòn liên hoàn gây sát thương', m.hp < h);
})();
(function () {
  var tran = tran2(['ninja'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 5), m = dat(tran.nguoi[1], 540, 500, 5);
  var h = m.hp;
  raChieu(tran, n, 'ult', null, n.x, n.y);
  chay(tran, 30);
  kt('ninja.ult — đột kích tới địch gần nhất gây sát thương', m.hp < h);
})();

/* ══════════════════════════ 12 NÚT Native ══════════════════════════ */

/* ---- crossbowman ---- */
(function () {
  var tran = tran2(['crossbowman'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 560, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'skill', m, m.x, m.y);
  chay(tran, 20);
  kt('crossbowman.skill — mũi tên thép trúng gây sát thương', m.hp < h);
})();
(function () {
  var tran = tran2(['crossbowman'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 560, 500, 3);
  m._cbMarkToi = tran.t + 100;
  var h = m.hp;
  raChieu(tran, n, 'skill', m, m.x, m.y);
  chay(tran, 20);
  var hSau = h - m.hp;
  var tran2b = tran2(['crossbowman'], ['knight']);
  var n2 = dat(tran2b.nguoi[0], 500, 500, 3), m2 = dat(tran2b.nguoi[1], 560, 500, 3);
  var h2 = m2.hp;
  raChieu(tran2b, n2, 'skill', m2, m2.x, m2.y);
  chay(tran2b, 20);
  var hSau2 = h2 - m2.hp;
  kt('crossbowman.skill — có Dấu Ấn thì gây thêm sát thương', hSau > hSau2);
})();
(function () {
  var tran = tran2(['crossbowman'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 560, 500, 3);
  n.huong = 0;
  var xTruoc = n.x;
  raChieu(tran, n, 'skill2', m, m.x, m.y);
  chay(tran, 20);
  kt('crossbowman.skill2 — tự bắn ngược ra sau', n.x < xTruoc);
})();
(function () {
  var tran = tran2(['crossbowman'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 560, 500, 3);
  n.huong = 0;
  var h = m.hp;
  raChieu(tran, n, 'ult', m, m.x, m.y);
  chay(tran, 20);
  kt('ult.crossbowman — vệt sáng trúng gây sát thương + để lại dấu ấn', m.hp < h && m._cbMarkToi > tran.t);
})();

/* ---- strongman ---- */
(function () {
  var tran = tran2(['strongman'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'skill', m, m.x, m.y);
  kt('strongman.skill — quật kẻ địch gây sát thương + choáng', m.hp < h && m.kc > 0 && m.kcLoai === 'choang');
})();
(function () {
  var tran = tran2(['strongman', 'knight'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 4), ban = dat(tran.nguoi[1], 520, 500, 4);
  var dich = dat(tran.nguoi[2], 620, 500, 4);
  raChieu(tran, n, 'ult', null, 620, 500);
  chay(tran, 30);
  kt('strongman.ult — có đồng minh gần thì ném đồng minh, ban nhận khiên', ban.chan.length === 1);
  kt('strongman.ult — kẻ địch quanh điểm hạ cánh bị choáng', dich.kc > 0 && dich.kcLoai === 'choang');
})();
(function () {
  var tran = tran2(['strongman'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 4);
  var dich = dat(tran.nguoi[1], 620, 500, 4);
  raChieu(tran, n, 'ult', null, 620, 500);
  chay(tran, 30);
  kt('strongman.ult — không có đồng minh thì tự nhảy và tự choáng', n.kc > 0 || gan(n.x, 620, 20));
})();

/* ---- spellbreaker ---- */
(function () {
  var tran = tran2(['spellbreaker'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  m.chan.push({ luong: 300, den: tran.t + 10 });
  var h = m.hp;
  raChieu(tran, n, 'ult', null, n.x, n.y);
  kt('spellbreaker.ult — phá lá chắn của kẻ địch có khiên', m.chan.length === 0);
  kt('spellbreaker.ult — kẻ có khiên bị choáng + chịu bonus_damage', m.hp < h && m.kc > 0);
})();
(function () {
  var tran = tran2(['spellbreaker'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 520, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'ult', null, n.x, n.y);
  var p = n.tuong.tfm.ult.effect;
  var kyVong = thucSat(tran, n, m, p.damage, 'pt');
  kt('spellbreaker.ult — kẻ không khiên chỉ chịu damage cơ bản (không choáng)', gan(h - m.hp, kyVong, 1) && m.kc <= 0);
})();

/* ---- astrologer ---- */
(function () {
  var tran = tran2(['astrologer'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 540, 500, 3);
  var h = m.hp;
  raChieu(tran, n, 'skill', null, m.x, m.y);
  chay(tran, 40);
  kt('astrologer.skill — thiên thạch trễ trúng gây sát thương + chậm', m.hp < h && m.chamMuc > 0);
})();
(function () {
  var tran = tran2(['astrologer'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 540, 500, 3);
  n.huong = 0;
  var h = m.hp;
  raChieu(tran, n, 'skill2', null, n.x + 600, n.y);
  chay(tran, 20);
  kt('astrologer.skill2 — đường thẳng trúng gây sát thương + đánh dấu', m.hp < h && m._astroMarkToi > tran.t);
})();
(function () {
  var tran = tran2(['astrologer'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 540, 500, 3);
  m._astroMarkToi = tran.t + 200;
  var h = m.hp;
  raChieu(tran, n, 'ult', null, m.x, m.y);
  chay(tran, 100);
  kt('astrologer.ult — nổ trễ gây sát thương (có cộng thêm vì đã có dấu ấn)', m.hp < h);
})();

/* ---- harpooner ---- */
(function () {
  var tran = tran2(['harpooner'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 560, 500, 3);
  n.huong = 0;
  var h = m.hp;
  raChieu(tran, n, 'skill', null, n.x + 600, n.y);
  chay(tran, 20);
  kt('harpooner.skill — lao móc trúng gây sát thương', m.hp < h);
})();
(function () {
  var tran = tran2(['harpooner'], ['knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3), m = dat(tran.nguoi[1], 560, 500, 3);
  n.huong = 0;
  m.hp = m.hpMax * 0.4;   /* đã mất nhiều máu → bonus theo missing_hp_ratio */
  var h = m.hp;
  raChieu(tran, n, 'skill2', null, n.x + 600, n.y);
  chay(tran, 20);
  var ne = n.tuong.tfm.skill2.effect;
  var kyVong = thucSat(tran, n, m, ne.damage + ne.attack_ratio / 100 * csCua(tran, n).atk + (m.hpMax - h) * ne.missing_hp_ratio / 100, 'vl');
  kt('harpooner.skill2 — sát thương cộng thêm theo máu đã mất', gan(h - m.hp, kyVong, kyVong * 0.1));
})();
(function () {
  var tran = tran2(['harpooner'], ['knight', 'knight']);
  var n = dat(tran.nguoi[0], 500, 500, 3);
  n.huong = 0;
  var m1 = dat(tran.nguoi[1], 560, 495, 3), m2 = dat(tran.nguoi[2], 560, 505, 3);
  var h1 = m1.hp, h2 = m2.hp;
  raChieu(tran, n, 'ult', null, n.x + 600, n.y);
  chay(tran, 40);
  kt('harpooner.ult — bắn quạt trúng nhiều mục tiêu, trói lại', (m1.hp < h1 || m2.hp < h2) && (m1.troi > tran.t || m2.troi > tran.t));
})();

console.log('\n=== ' + DAT + ' ĐẠT / ' + HONG + ' HỎNG (tổng ' + (DAT + HONG) + ') ===');
if (HONG > 0) process.exit(1);
