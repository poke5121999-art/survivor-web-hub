/*
 * Bộ kiểm khói cho Mốc 1. Chạy: node tools/smoke.js  (từ games/orbit/)
 *
 * Nó KHÔNG phải trình duyệt. Canvas bị đếm chứ không rasterise. Cái nó chứng
 * minh là phần thật sự hay gãy ở một prototype: tệp có parse không, một khung
 * hình có vẽ mà không ném lỗi không, và — quan trọng nhất — CẢ HAI BẢN có thật
 * sự sản xuất ra bánh răng trong 3 phút không. Một bản dựng thử mà một trong
 * hai bản đứng im thì mọi so sánh sau đó đều vô nghĩa.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var fails = [];
function ok(cond, msg) { if (!cond) fails.push(msg); console.log((cond ? '  ok   ' : '  FAIL ') + msg); }

// ------------------------------------------------------------------ stub DOM
var CTX = ['clearRect','fillRect','strokeRect','drawImage','beginPath','closePath','moveTo',
  'lineTo','arc','ellipse','fill','stroke','save','restore','translate','scale','rotate',
  'setTransform','resetTransform','fillText','strokeText','rect','clip','arcTo','setLineDash'];
function makeCtx() {
  var c = { fillStyle:'#000', strokeStyle:'#000', lineWidth:1, font:'10px x', textAlign:'left', textBaseline:'alphabetic' };
  CTX.forEach(function (m) { c[m] = function () {}; });
  c.measureText = function (t) { return { width: String(t).length * 6 }; };
  return c;
}
function makeEl(tag) {
  var el = {
    tagName: String(tag).toUpperCase(), style: {}, width: 0, height: 0,
    addEventListener: function () {}, removeEventListener: function () {},
    getBoundingClientRect: function () { return { left:0, top:0, width:400, height:800 }; }
  };
  if (tag === 'canvas') { var cx = makeCtx(); el.getContext = function () { return cx; }; }
  return el;
}
var stage = makeEl('div'), view = makeEl('canvas');
global.window = global;
global.document = {
  getElementById: function (id) { return id === 'stage' ? stage : view; },
  addEventListener: function () {}, hidden: false
};
global.innerWidth = 400; global.innerHeight = 800; global.devicePixelRatio = 2;
global.addEventListener = function () {};
var rafQueue = [];
global.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
global.__errs = [];

// ------------------------------------------------------------------ nạp game
var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
try { (0, eval)(src); } catch (e) { console.log('  FAIL nạp game.js: ' + e.message); process.exit(1); }
var G = global.__orbit;
ok(!!G, 'game.js boot và công bố window.__orbit');

// ------------------------------------------------------------------ 1. một khung hình
try { G.draw(); ok(true, 'draw() một khung hình không ném lỗi'); }
catch (e) { ok(false, 'draw() ném lỗi: ' + e.message); }

// ------------------------------------------------------------------ helper
function run(s, secs) { for (var i = 0; i < secs * 60; i++) G.step(s, 1 / 60); }
function nearestOre(s, fromY) {
  var best = null;
  for (var i = 0; i < s.ore.length; i++) if (s.ore[i].y >= fromY && (!best || s.ore[i].y < best.y)) best = s.ore[i];
  return best;
}
// Đặt máy trong tầm với bằng cách dời người chơi tới đó trước — đúng cái người
// chơi thật phải làm bằng stick, chỉ là không phải chờ nó đi.
function put(s, kind, x, y) { s.px = x + 0.5; s.py = y + 0.5; return G.place(s, kind, x, y); }

// ------------------------------------------------------------------ 2. bản A
var A = G.newGame('A');
A.scrap = 99;
var o = nearestOre(A, 6);
ok(!!o, 'bản đồ có mỏ để khoan');
ok(put(A, 'drill', o.x, o.y), 'đặt Khoan lên mỏ');
ok(!put(A, 'drill', (o.x + 1) % 12, o.y), 'Khoan KHÔNG đặt được ngoài mỏ');

var sy = o.y - 1;
ok(put(A, 'smelt', (o.x + 1) % 12, sy), 'đặt Lò nung');
ok(put(A, 'asm', (o.x + 2) % 12, sy), 'đặt Máy chế');
var drill = A.mach.filter(function (m) { return m.k === 'drill'; })[0];
var smelt = A.mach.filter(function (m) { return m.k === 'smelt'; })[0];
var asm   = A.mach.filter(function (m) { return m.k === 'asm'; })[0];
var hub   = A.mach.filter(function (m) { return m.k === 'hub'; })[0];

G.link(A, drill, smelt); G.link(A, smelt, asm); G.link(A, asm, hub);
ok(A.links.length === 3, 'ba liên kết được tạo (được ' + A.links.length + ')');

// cổng hữu hạn: Khoan chỉ có 1 cổng ra, liên kết thứ hai phải bị từ chối
var before = A.links.length;
ok(put(A, 'smelt', (o.x + 3) % 12, sy), 'đặt Lò nung thứ hai');
var smelt2 = A.mach.filter(function (m) { return m.k === 'smelt'; })[1];
G.link(A, drill, smelt2);
ok(A.links.length === before, 'Khoan hết cổng ra → liên kết thứ hai bị chặn (đúng luật 5.1)');

// nhà trung chuyển gỡ được đúng cái nút thắt đó
var relayY = o.y + 1;
ok(put(A, 'relay', o.x, relayY) || put(A, 'relay', (o.x + 1) % 12, relayY), 'đặt nhà Trung chuyển');
ok(G.linkRate(2) > G.linkRate(16), 'băng thông tụt theo khoảng cách: ' +
  G.linkRate(2).toFixed(2) + '/s ở 2 ô vs ' + G.linkRate(16).toFixed(2) + '/s ở 16 ô');

run(A, 179);
ok(A.score > 0, 'bản A sản xuất được bánh răng trong 3 phút (được ' + A.score + ')');
run(A, 2);
ok(A.over === true, 'phiên tự kết thúc ở 180 giây');
ok(G.results.A && G.results.A.score === A.score, 'kết quả bản A được ghi lại');

// ------------------------------------------------------------------ 3. bản B
var B = G.newGame('B');
B.scrap = 99;
var o2 = nearestOre(B, 6);
ok(o2.x === o.x && o2.y === o.y, 'HAI BẢN NHẬN CÙNG BẢN ĐỒ (cùng seed) — điều kiện để so sánh đọc được');
put(B, 'drill', o2.x, o2.y);
put(B, 'smelt', (o2.x + 1) % 12, o2.y - 1);
put(B, 'asm', (o2.x + 2) % 12, o2.y - 1);
ok(B.links.length === 0, 'bản B không có liên kết nào');
run(B, 179);
ok(B.score > 0, 'bản B sản xuất được bánh răng trong 3 phút (được ' + B.score + ')');

// ------------------------------------------------------------------ 4. ràng buộc khoảng cách có CẮN không
// Câu hỏi của Mốc 2, hỏi bằng số thay vì bằng cảm giác: cùng một dây chuyền, chỉ
// khác chỗ NỐI GỌN hay NỐI ẨU, hai bên có ra hai sản lượng khác nhau không?
// Nếu không, ràng buộc 1 chỉ là trang trí và bản A không hơn gì bản B.
function chain(spread) {
  var s = G.newGame('A'); s.scrap = 999;
  var oo = nearestOre(s, 10);
  put(s, 'drill', oo.x, oo.y);
  var sx = (oo.x + spread) % 12, ax = (oo.x + 2 * spread) % 12;
  put(s, 'smelt', sx, oo.y + spread);
  put(s, 'asm', ax, oo.y + 2 * spread);
  var d = s.mach.filter(function (m) { return m.k === 'drill'; })[0];
  var sm = s.mach.filter(function (m) { return m.k === 'smelt'; })[0];
  var am = s.mach.filter(function (m) { return m.k === 'asm'; })[0];
  var hb = s.mach.filter(function (m) { return m.k === 'hub'; })[0];
  G.link(s, d, sm); G.link(s, sm, am); G.link(s, am, hb);
  run(s, 179);
  return s.score;
}
var tight = chain(1), loose = chain(6);
console.log('    nối gọn = ' + tight + ' bánh · nối ẩu = ' + loose + ' bánh');
ok(tight > loose, 'nối gọn hơn nối ẩu → ràng buộc khoảng cách THẬT SỰ cắn');

// ------------------------------------------------------------------ 5. cùng luật chế biến
// Không ép hai điểm bằng nhau — chúng KHÔNG nên bằng nhau, đó là kết quả cần đo.
// Cái phải bằng nhau là luật: cùng công thức, cùng thời gian, cùng bản đồ.
ok(G.KINDS.smelt.time === 2.0 && G.KINDS.asm.time === 2.6, 'thời gian chế biến là hằng số dùng chung');
console.log('\n  điểm A = ' + A.score + '  ·  điểm B = ' + B.score +
  '   (số chênh nhau là DỮ LIỆU, không phải lỗi)');

ok(global.__errs.length === 0, 'không có lỗi runtime nào lọt vào window.__errs');

console.log('\n' + (fails.length ? fails.length + ' MỤC HỎNG' : 'tất cả đều qua'));
process.exit(fails.length ? 1 : 0);
