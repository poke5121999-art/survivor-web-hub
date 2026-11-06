// node games/restaurant-city/tools/stamp.js <rev> [games.js]
// Đổi rev của Restaurant City ở index.html (mọi ?v=), js/rc-page.js (REV) và thẻ trong data/games.js (rev:).
// Tính hết nội dung mới, chạy thử data/games.js mới, chỉ khi ổn mới ghi file. [games.js] để đổi một bản khác
// (vd. bản lấy từ origin/main khi commit qua index tạm). Chỉ thay phần số của rev, không đụng dấu phẩy quanh nó:
// lần sửa tay 2026-10-27 nuốt mất dấu phẩy sau rev và cả trang chủ hub mất danh sách game.
'use strict';
const fs = require('fs');
const path = require('path');

const rev = process.argv[2];
if (!/^\d{8}[a-z]$/.test(rev || '')) {
  console.error('usage: node stamp.js <rev like 20261027b> [games.js]');
  process.exit(1);
}
const GAME = path.join(__dirname, '..');
const gamesJs = path.resolve(process.argv[3] || path.join(GAME, '../../data/games.js'));

function rewritten(file, pattern, replace, expected) {
  const src = fs.readFileSync(file, 'utf8');
  const count = (src.match(new RegExp(pattern.source, 'g')) || []).length;
  if (expected !== undefined ? count !== expected : count === 0) throw new Error(`${file}: ${count} match(es) for ${pattern}`);
  return { file, count, text: src.replace(pattern, replace) };
}

const edits = [
  rewritten(path.join(GAME, 'index.html'), /\?v=\d{8}[a-z]/g, `?v=${rev}`),
  rewritten(path.join(GAME, 'js/rc-page.js'), /var REV = "\d{8}[a-z]";/, `var REV = "${rev}";`, 1),
  rewritten(gamesJs, /(id: "restaurant-city",[\s\S]*?\brev: ")\d{8}[a-z](")/, `$1${rev}$2`, 1),
];

const window = {};
new Function('window', edits[2].text)(window);
const card = (window.HUB_GAMES || []).find((g) => g.id === 'restaurant-city');
if (!card || card.rev !== rev) throw new Error(`${gamesJs}: restaurant-city card rev would be ${card && card.rev}`);

for (const e of edits) fs.writeFileSync(e.file, e.text);
console.log(`rev ${rev}: index.html ${edits[0].count} ?v=, rc-page.js REV, ${gamesJs} (${window.HUB_GAMES.length} games parse)`);
