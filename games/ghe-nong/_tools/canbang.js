/* _tools/canbang.js — chạy hàng trăm trận bằng máy để đo cân bằng.
   Không nằm trong game; chạy bằng node:

       node _tools/canbang.js            300 trận, mọi vị trí ngẫu nhiên
       node _tools/canbang.js 1000       nhiều hơn

   In ra tỉ lệ thắng từng tướng — chính là bảng "Champ Stats" mà Teamfight Manager 2 dùng để
   tự buff/nerf mỗi mùa (RESEARCH.md §2.13). Ở đây dùng để soi con nào đang quá mạnh.
*/
global.window = global;
var kho = {};
global.localStorage = { getItem: function (k) { return kho[k] || null; },
  setItem: function (k, v) { kho[k] = v; }, removeItem: function (k) { delete kho[k]; } };
global.document = { addEventListener: function () {}, querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function () { return { style: {}, setAttribute: function () {}, addEventListener: function () {}, appendChild: function () {} }; },
  readyState: 'complete' };
global.navigator = { vibrate: function () {} };

var duong = __dirname.replace(/\\/g, '/') + '/../js/';
['util', 'data-kynang', 'data-tuong', 'data-trangbi', 'data-hlv', 'data-tuyenthu',
 'data-giai', 'data-sukien', 'save', 'ca', 'sim'].forEach(function (f) { require(duong + f + '.js'); });

var G = global;
G.taiSave();

var SO = parseInt(process.argv[2] || '300', 10);
var VT = ['tren', 'rung', 'giua', 'duoi', 'ho'];
var theoVT = {};
VT.forEach(function (v) { theoVT[v] = G.tuongTheoViTri(v).map(function (t) { return t.id; }); });

var thongKe = {};
G.TUONG.forEach(function (t) { thongKe[t.id] = { ten: t.ten, vt: t.vt, tran: 0, thang: 0, k: 0, d: 0, a: 0, dmg: 0, chiu: 0, hoi: 0 }; });

var rng = G.Rng(20260910);

function doiNgauNhien(ten) {
  return {
    ten: ten, mau: '#888', heso: { ds: [] },
    chienThuat: { rong: rng.chon(['luon', 'tuy', 'nhuong']), rung: rng.chon(['gank', 'farm', 'cuop']),
      mucTieu: rng.chon(['poke', 'lao']) },
    nguoi: VT.map(function (v, i) {
      return {
        vt: v, tuyenthuId: 'm' + i, tuongId: rng.chon(theoVT[v]),
        tt: rng.chon(['SR', 'SR', 'SSR', 'R']),
        ten: ten.slice(0, 1) + i,
        chat: [rng.chon(['fight', 'farm', 'le', 'gank', 'thu', 'poke', 'lao', 'mt', 'solo', 'lead'])],
        ego: rng.khoang(15, 85),
        cs: { co: rng.khoang(400, 900), ben: rng.khoang(400, 900), luc: rng.khoang(400, 900),
              li: rng.khoang(400, 900), nao: rng.khoang(400, 900) }
      };
    })
  };
}

var tongTG = 0, tongMang = 0, hetGio = 0, tongVang = 0;
for (var s = 0; s < SO; s++) {
  var A = doiNgauNhien('A'), B = doiNgauNhien('B');
  var tran = G.taoTran({ ta: A, dich: B, nhip: rng.chon(['chop', 'ngan', 'dai']) }, 4000 + s);
  var kq = G.chayHet(tran);
  tongTG += kq.thoiGian; tongMang += kq.mang.xanh + kq.mang.do;
  tongVang += kq.vang.xanh + kq.vang.do;
  if (kq.hetGio) hetGio++;

  kq.nguoi.forEach(function (n, i) {
    var tid = tran.nguoi[i].tuong.id;
    var tk = thongKe[tid];
    tk.tran++; tk.k += n.k; tk.d += n.d; tk.a += n.a; tk.dmg += n.dmg; tk.chiu += n.nhan; tk.hoi += n.hoi;
    if (n.doi === kq.thang) tk.thang++;
  });
}

console.log('\n=== ' + SO + ' trận ===');
console.log('dài trung bình : ' + (tongTG / SO / 60).toFixed(1) + ' phút   (hết giờ: ' + hetGio + ')');
console.log('mạng mỗi trận  : ' + (tongMang / SO).toFixed(1));
console.log('vàng mỗi trận  : ' + Math.round(tongVang / SO) + ' (cả hai đội)');

VT.forEach(function (v) {
  console.log('\n── ' + v.toUpperCase() + ' ──');
  console.log('tướng        trận  thắng%   K/D/A trung bình   dmg    chịu    hồi');
  G.TUONG.filter(function (t) { return t.vt === v; }).forEach(function (t) {
    var k = thongKe[t.id];
    if (!k.tran) { console.log(t.ten + '  (chưa ra trận)'); return; }
    var tl = (k.thang / k.tran * 100).toFixed(1);
    console.log(
      t.ten.padEnd(12) +
      String(k.tran).padStart(4) +
      (tl + '%').padStart(8) + '   ' +
      ((k.k / k.tran).toFixed(1) + '/' + (k.d / k.tran).toFixed(1) + '/' + (k.a / k.tran).toFixed(1)).padEnd(16) +
      String(Math.round(k.dmg / k.tran)).padStart(6) +
      String(Math.round(k.chiu / k.tran)).padStart(8) +
      String(Math.round(k.hoi / k.tran)).padStart(7));
  });
});

/* con nào lệch quá thì kêu lên */
console.log('\n── lệch quá 12% so với 50% ──');
var co = false;
G.TUONG.forEach(function (t) {
  var k = thongKe[t.id];
  if (k.tran < 10) return;
  var tl = k.thang / k.tran * 100;
  if (Math.abs(tl - 50) > 12) { console.log('  ' + (tl > 50 ? 'MẠNH ' : 'YẾU  ') + t.ten.padEnd(12) + tl.toFixed(1) + '%  (' + k.tran + ' trận)'); co = true; }
});
if (!co) console.log('  không con nào — cân trong ngưỡng.');
