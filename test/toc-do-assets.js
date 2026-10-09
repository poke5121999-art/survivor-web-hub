/*
 * Tốc Độ: asset hai chiều (Node, không trình duyệt).
 * 1. Mọi tệp mà data/*.js trỏ tới đều tồn tại (glb, lightmap, texture VFX, sprite, tiếng, font).
 * 2. Mọi tên tiếng / VFX / sprite mà mã game gọi đều có trong bảng dữ liệu (gọi tên không có là im lặng, không ném lỗi).
 * 3. Liệt kê asset bóc ra mà không chỗ nào gọi (bài học Biển Mù: bóc xong không nối dây thì như không có).
 * Chạy: node test/toc-do-assets.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./toc-do-lib');

const W = T.nodeSim(['data/tuning.js', 'data/tracks.js', 'data/cars.js', 'data/drivers.js', 'data/audio.js', 'data/fx.js', 'data/ui.js', 'data/ugui.js']);
const TD = W.TD;
const G = T.GAME;
const exists = (rel) => fs.existsSync(path.join(G, rel));
const code = ['js/main.js', 'js/ui/hud.js', 'js/ui/menu.js', 'js/view/fx.js', 'js/view/karts.js', 'js/view/audio.js', 'css/game.css']
  .map((f) => fs.readFileSync(path.join(G, f), 'utf8')).join('\n');

console.log('Tệp được trỏ tới');
const miss = [];
for (const id in TD.TRACKS) {
  const t = TD.TRACKS[id], dir = t.art.replace(/[^/]*$/, '');
  if (!exists(t.art)) miss.push(t.art);
  const meta = JSON.parse(fs.readFileSync(path.join(G, dir, 'meta.json'), 'utf8'));
  for (const l of meta.lightmaps) if (!exists(dir + l.file)) miss.push(dir + l.file);
  if (!exists('art/maps/' + id + '.jpg')) miss.push('art/maps/' + id + '.jpg');
}
for (const id in TD.CARS) if (!exists(TD.CARS[id].glb)) miss.push(TD.CARS[id].glb);
for (const id in TD.DRIVERS) if (!exists(TD.DRIVERS[id].glb)) miss.push(TD.DRIVERS[id].glb);
for (const k in TD.AUDIO) for (const f of TD.AUDIO[k].files) if (!exists(f)) miss.push(f);
for (const k in TD.FX) for (const l of [TD.FX[k]].concat(TD.FX[k].layers || [])) if (l.tex && !exists(l.tex)) miss.push(l.tex);
for (const k in TD.UI) if (!exists(TD.UI[k].src)) miss.push(TD.UI[k].src);
if (!exists(TD.UGUI.sheet)) miss.push(TD.UGUI.sheet);
for (const k in TD.UGUI.fonts) if (TD.UGUI.fonts[k] && !exists(TD.UGUI.fonts[k])) miss.push(TD.UGUI.fonts[k]);
T.check('mọi tệp được trỏ tới đều có', miss.length === 0, miss.slice(0, 8).join(', ') || 'đủ');
T.check('6 đường đua, 8 xe, 2 tay đua', Object.keys(TD.TRACKS).length === 6 && Object.keys(TD.CARS).length === 8 && Object.keys(TD.DRIVERS).length === 2);
const clips = ['drive', 'left', 'right', 'drift_l', 'drift_r', 'boost', 'land', 'crash_l', 'crash_r', 'win', 'lose', 'idle1'];
T.check('tay đua có đủ clip mà karts.js gọi', Object.values(TD.DRIVERS).every((d) => clips.every((c) => d.clips[c])));
T.check('xe nào cũng có 4 bánh và chỗ ngồi', Object.values(TD.CARS).every((c) => c.wheels.length === 4 && c.driverMount));

console.log('Tên mã gọi phải có trong bảng');
const audioCalls = [...code.matchAll(/'(Play_[A-Za-z0-9_]+)'/g)].map((m) => m[1]);
const badAudio = [...new Set(audioCalls)].filter((k) => !TD.AUDIO[k]);
T.check('mọi tiếng mã gọi đều có trong TD.AUDIO', badAudio.length === 0, badAudio.join(', ') || audioCalls.length + ' lời gọi');
const fxCalls = [...code.matchAll(/emitter\('([a-z_]+)'/g)].map((m) => m[1]);
const badFx = fxCalls.filter((k) => !TD.FX[k]);
T.check('mọi VFX mã gọi đều có trong TD.FX', badFx.length === 0, badFx.join(', ') || fxCalls.length + ' bộ phát');
const fxTex = [...code.matchAll(/'(art\/fx\/[^']+)'/g)].map((m) => m[1]);
T.check('texture VFX gọi thẳng trong mã đều có', fxTex.every(exists), fxTex.filter((f) => !exists(f)).join(', '));
const uiFiles = [...code.matchAll(/art\/ui\/([a-z0-9_]+)\.png/g)].map((m) => m[1]);
T.check('sprite art/ui gọi trong mã đều có', uiFiles.every((n) => exists('art/ui/' + n + '.png')), uiFiles.filter((n) => !exists('art/ui/' + n + '.png')).join(', '));

console.log('Đã bóc mà chưa dùng (thông tin)');
const unusedAudio = Object.keys(TD.AUDIO).filter((k) => !code.includes("'" + k + "'"));
console.log('  tiếng chưa gọi: ' + unusedAudio.length + '/' + Object.keys(TD.AUDIO).length + (unusedAudio.length ? ' (' + unusedAudio.join(', ') + ')' : ''));
// VFX cố ý không dùng: tên -> lý do một dòng. Mục nào được dùng thì xoá khỏi đây (test dưới báo nếu lệch).
const FX_SKIP = {
  drift_flame_c: 'biến thể lửa drift (driftflame_00010) của xe khác; web chỉ có một kiểu lửa drift là 00003',
  tire_smoke: 'mesh khói tĩnh FX_Car_Common_Smoke; khói lốp đã có từ tire_dust dạng hạt',

  nitro_flame_big: 'lửa phun dạng mesh riêng của xe SDFB (00001); web dựng một lửa DTS dùng chung cho mọi xe, chưa có bảng xe nào dùng SDFB',
  miniboost_flame: 'như nitro_flame_big, bản phun nhỏ',
  start_line: 'dải vạch xuất phát đặt cứng toạ độ cảnh Level (376, 44, 183); web có vạch xuất phát riêng của đường',
};
const unusedFx = Object.keys(TD.FX).filter((k) => !fxCalls.includes(k) && !code.includes('TD.FX.' + k) && !fxTex.some((t) => [TD.FX[k]].concat(TD.FX[k].layers || []).some((l) => l.tex === t)));
const unexplained = unusedFx.filter((k) => !FX_SKIP[k]), stale = Object.keys(FX_SKIP).filter((k) => !unusedFx.includes(k));
T.check('mọi VFX chưa gọi đều có lý do trong FX_SKIP', unexplained.length === 0 && stale.length === 0, unexplained.concat(stale.map((k) => k + ' (đã dùng, bỏ khỏi FX_SKIP)')).join(', ') || unusedFx.length + '/' + Object.keys(TD.FX).length + ' cố ý bỏ');
const usedUi = new Set(uiFiles);
console.log('  sprite art/ui dùng: ' + usedUi.size + '/' + Object.keys(TD.UI).length);
T.done();
