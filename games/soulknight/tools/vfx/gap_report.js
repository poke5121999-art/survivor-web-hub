/*
 * Báo cáo khoảng cách hình: hiệu ứng nào dùng thứ runtime js/vfx.js không vẽ đúng như Unity, xếp theo số lần xuất hiện
 * khi chơi thật (đếm bằng play_count.js).
 *
 *   node games/soulknight/tools/vfx/gap_report.js [--play đếm.json] [--top 40] [--name regex] [--json ra.json]
 *
 * Nguồn: data/sk-vfx.js (+ thân đạn 'W:*' của data/sk-weapons86.js). Mỗi hiệu ứng -> danh sách khoảng cách:
 *   - mục `u` ảnh hưởng hình (cùng luật visual_unsupported của build_vfx.py): ps:noise, ps:render:mesh, shader:...
 *   - thứ runtime biết mà bỏ qua / làm gần đúng (đo từ dữ liệu): tr/ln texture, renderMode 2/3, sortMode, flip, shape
 *     align/rndPos, hệ không có rate/bursts (script Emit), tint > 1 (chỉ kẹp màu, texel tối không sáng thêm)
 *   - 'fixed:*' = đã sửa (2026-09-30), giữ để biết số hiệu ứng được lợi; 'info:*' = không phải lỗi.
 * Thân đạn 'W:*' (sk-weapons86.js, lever khác) không mang vật liệu/tint nên báo '—' dù có thể sai.
 */
const fs = require('fs');
const path = require('path');
const GAME = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

global.window = {};
require(path.join(GAME, 'data', 'sk-vfx.js'));
try { require(path.join(GAME, 'data', 'sk-weapons86.js')); } catch (e) { /* không có thì thôi */ }
const V = window.SK_VFX, X = window.SK_W86;
const effects = Object.assign({}, V.effects);
if (X && X.fx) for (const k in X.fx) effects['W:' + k] = X.fx[k];

const VIS_MB = /Sprite|Tween|Texture|Material|HSV|Vfx|Rotat|Line|Laser|Trail|Chain|Thunder|Lightning|Follow|Flip|Fade|Alpha|Color|Scale|Shake|Anim|Ring|Wave|Distort|Glow|Shadow|Outline|Particle|Afterimage|Phantom/i;
function visual(u) {
  if (/^(ps:|sr:|shader:|clip:pptr)/.test(u) || u === 'clip:type212') return true;
  if (u.startsWith('comp:')) return /^(SpriteMask|MeshRenderer|SkinnedMeshRenderer|TextMesh|Light|Canvas)$/.test(u.slice(5));
  if (u.startsWith('mb:')) return VIS_MB.test(u.slice(3)) && u !== 'mb:BuffIce';
  return false;
}

function gaps(name, e) {
  const g = new Set();
  for (const u of e.u || []) if (visual(u)) g.add(u.replace(/\(.*\)$/, ''));
  const R = e.nodes[0] && e.nodes[0].T;
  if (R && (R[0] || R[1]) && !(e.cat === 'buff' && Math.abs(R[0]) < 0.5)) g.add('fixed:root-offset-dropped');
  for (const nd of e.nodes) {
    const p = nd.ps;
    if (p) {
      if (p.rate == null && p.rateDist == null && !p.bursts) g.add('ps:emit-by-script');
      if (p.rm >= 2) g.add('ps:renderMode' + p.rm);
      if (p.sortMode) g.add('ps:sortMode');
      if (p.flip) g.add('ps:flip');
      if (p.scl) g.add(p.scl === 2 ? 'fixed:scalingShape' : 'fixed:scalingLocal');
      if (p.shape && p.shape.align) g.add('ps:shape-align');
      if (p.shape && p.shape.rndPos) g.add('ps:shape-rndPos');
      if (p.tint && p.tint.some((v, i) => i < 3 && v > 1)) g.add('approx:tint>1');
      if (p.tex === '#white') g.add('fixed:white-quad');
      for (const m of p.u || []) g.add('ps:' + m);
    }
    if (nd.tr && nd.tr.tex) g.add('tr:texture-ignored');
    if (nd.ln && nd.ln.tex) g.add('ln:texture-ignored');
    if (nd.sr && nd.sr.tint) g.add(nd.sr.tint.some((v, i) => i < 3 && v > 1) ? 'fixed:sr-tint(approx>1)' : 'fixed:sr-tint');
  }
  if (e.end) g.add('fixed:buff-end');
  // không phải lỗi: trạng thái mặc định rỗng, game phải truyền o.state (không truyền thì chạy clip 0)
  for (const a of e.anims || []) if (!a.seq.length) g.add('info:needs-state(' + Object.keys(a.st || {}).slice(0, 3).join('|') + ')');
  return [...g].sort();
}

const play = arg('--play') ? JSON.parse(fs.readFileSync(arg('--play'), 'utf8')).counts : null;
const count = {};
if (play) for (const k in play) { if (k[0] === '~') continue; const n = k.split('@')[0]; count[n] = (count[n] || 0) + play[k]; }
const re = arg('--name') ? new RegExp(arg('--name')) : null;
const rows = [];
const byGap = {};
for (const [n, e] of Object.entries(effects)) {
  if (re && !re.test(n)) continue;
  const g = gaps(n, e), c = count[n] || 0;
  rows.push({ n, c, cat: e.cat, g });
  for (const x of g) { const b = byGap[x] || (byGap[x] = { eff: 0, spawns: 0 }); b.eff++; b.spawns += c; }
}
rows.sort((a, b) => (b.c - a.c) || a.n.localeCompare(b.n));
const top = +arg('--top', 40);
const total = rows.reduce((s, r) => s + r.c, 0);
console.log('hiệu ứng: ' + rows.length + (play ? ', lần sinh khi chơi: ' + total : ''));
console.log('\n== khoảng cách (số hiệu ứng / số lần sinh khi chơi) ==');
for (const [k, v] of Object.entries(byGap).sort((a, b) => (b[1].spawns - a[1].spawns) || (b[1].eff - a[1].eff)).slice(0, 60))
  console.log(String(v.eff).padStart(6) + String(play ? v.spawns : '').padStart(8) + '  ' + k);
if (play) {
  console.log('\n== ' + top + ' hiệu ứng hay gặp nhất ==');
  for (const r of rows.slice(0, top)) console.log(String(r.c).padStart(6) + '  ' + r.n + ' [' + r.cat + ']  ' + (r.g.join(', ') || '—'));
}
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ byGap, rows }, null, 1));
