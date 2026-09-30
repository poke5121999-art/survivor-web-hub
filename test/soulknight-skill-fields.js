/*
 * Soát trường riêng của người chơi trong kỹ năng Hiệp Sĩ Linh Hồn: node test/soulknight-skill-fields.js
 * K.timers và SK.on(...) của mọi tệp js/skills/*.js chạy với mọi nhân vật, nên trường `p._x` mà hai tệp cùng ghi sẽ
 * bị mã của nhân vật kia đọc nhầm (đã sập: timers.tigerPunch của fighter trừ đồng hồ p._tp của arcaneknight).
 * Trường dùng chung có chủ ý (lõi đọc) nằm trong SHARED.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'games', 'soulknight', 'js');
const SHARED = new Set(['_alpha', '_cdAfter', '_ch', '_liftY', '_immuneT', '_hurt', '_hOrig', '_animsOrig', '_mulSrc', '_night']);
const files = [path.join(ROOT, 'skills.js')].concat(
  fs.readdirSync(path.join(ROOT, 'skills')).filter(f => /\.js$/.test(f)).map(f => path.join(ROOT, 'skills', f)));

const owners = {};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\b(?:p|pl)\.(_[A-Za-z0-9]+)\s*=(?!=)/g)) {
    if (SHARED.has(m[1])) continue;
    (owners[m[1]] = owners[m[1]] || new Set()).add(path.basename(f, '.js'));
  }
}
const clash = Object.entries(owners).filter(([, s]) => s.size > 1).map(([k, s]) => k + ': ' + [...s].join(', '));
console.log(Object.keys(owners).length + ' trường riêng, ' + files.length + ' tệp');
if (clash.length) { console.log('  ✘ trường trùng giữa các tệp kỹ năng:\n    ' + clash.join('\n    ')); process.exit(1); }
console.log('  ✔ không trường riêng nào bị hai tệp cùng ghi');
