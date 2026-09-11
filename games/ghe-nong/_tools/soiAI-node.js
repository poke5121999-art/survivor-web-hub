/* soiAI-node.js — chạy _tools/soiAI.js NGOÀI trình duyệt.
 *
 * `[BẪY ĐÃ SẬP]` Chạy bộ đo AI qua `lai.js` (Chrome headless) mất ~8 phút cho 24 trận và
 * có lần treo hẳn không chịu trả lời. Cùng bộ mã ấy chạy thẳng trong Node xong trong
 * ~35 giây — nhanh gấp mười mấy lần. Lý do: bộ mô phỏng không đụng gì tới DOM hay canvas
 * khi `tran.veHinh` tắt, nên cả cái trình duyệt chỉ là gánh nặng.
 *
 * Chỉ cần dựng vài cái giả (`window`, `document`, `Image`, `localStorage`) đủ để mấy tệp
 * dữ liệu nạp xong. Tệp nào cần DOM thật (`tieng.js`) thì nạp lỗi cũng không sao — bộ mô
 * phỏng không gọi tới.
 *
 *   node _tools/soiAI-node.js                 # mặc định chạy _tools/soiAI.js
 *   node _tools/soiAI-node.js _tools/canbang.js
 *
 * Kịch bản truyền vào phải là MỘT BIỂU THỨC trả về kết quả (đúng dạng `--dofile=` của
 * `lai.js`), nên đổi bộ đo nào sang Node cũng chỉ là gọi thêm một đường dẫn ở đây.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* Máy này hay có nhiều tác nhân chạy song song, và bộ đo là việc CPU thuần. Có lần 150
   trận lẽ ra mất 3 phút thì bò mất hơn 20 phút vì bị mấy tiến trình Chrome khác giành
   hết lượt. Nâng độ ưu tiên một nấc là đủ, không cần nấc cao nhất. */
try { require('os').setPriority(0, -10); } catch (e) { /* không có quyền thì thôi */ }

const goc = path.join(__dirname, '..');
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

['art/asset-map.js', 'js/util.js', 'js/sprites.js', 'js/tieng.js', 'js/data-kynang.js',
 'js/data-tuong.js', 'js/data-trangbi.js', 'js/fx-chieu.js', 'js/data-hlv.js',
 'js/data-tuyenthu.js', 'js/data-giai.js', 'js/data-sukien.js', 'js/save.js',
 'js/day.js', 'js/ca.js', 'js/data-thoai.js', 'js/sim.js', 'js/mua.js', 'js/giai.js'
].forEach(function (f) {
  try { vm.runInThisContext(fs.readFileSync(path.join(goc, f), 'utf8'), { filename: f }); }
  catch (e) { /* tệp cần DOM thật — bộ mô phỏng không gọi tới */ }
});

/* Mấy bộ đo đụng tới ca/mùa (`tileThang.js`) đọc `G.S`, mà `G.S` chỉ được dựng khi
   `main.js` gọi `taiSave()` lúc trang mở. Ở đây không có trang nào, nên gọi tay. */
if (window.taiSave && !window.S) window.taiSave();

const kich = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'soiAI.js');
const ma = fs.readFileSync(kich, 'utf8');
const kq = vm.runInThisContext(ma, { filename: path.basename(kich) });
console.log(JSON.stringify(kq));
