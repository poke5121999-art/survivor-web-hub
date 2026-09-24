// Kiểm mọi lộ trình A → B → C ghép theo mã miệng nối: xếp chồng vách như js/dive.js rồi loang từ chỗ
// Dave xuống nước, xem thợ lặn bơi tới được tầng nào và sâu tới đâu.
//   node games/ho-xanh/tools/route-check.js [entryY]
'use strict';
const path = require('path');
global.window = {};
require(path.join(__dirname, '../data/zones.js'));
require(path.join(__dirname, '../data/tuning.js'));
const Z = window.HX_ZONES, T = window.HX_TUNING;
const ENTRY = process.argv[2] ? +process.argv[2] : T.dive.entryY;
const CELL = 0.25, R = 0.2, SURF = T.water.surfaceY;

function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

function stack(ids) {
  let yTop = SURF;
  const layers = [], polys = [];
  ids.forEach((id, i) => {
    const z = Z[id], yOff = i === 0 ? 0 : yTop - ENTRY;
    layers.push({ id, yTop, yBot: z.bounds.minY + yOff });
    z.walls.forEach(p => {
      const q = p.map(v => [v[0], v[1] + yOff]);
      const xs = q.map(v => v[0]), ys = q.map(v => v[1]);
      polys.push({ q, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) });
    });
    yTop = z.bounds.minY + yOff;
  });
  return { layers, polys, minY: yTop };
}

function reach(ids) {
  const S = stack(ids), x0 = -80, x1 = 80, y1 = SURF - 0.4, y0 = S.minY + 0.4;
  const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((y1 - y0) / CELL);
  const solid = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const y = y1 - j * CELL;
    const rows = S.polys.filter(p => y >= p.minY - R && y <= p.maxY + R);
    for (let i = 0; i < W; i++) {
      const x = x0 + i * CELL;
      for (const p of rows) {
        if (x < p.minX - R || x > p.maxX + R) continue;
        if (inside(p.q, x, y) || inside(p.q, x + R, y) || inside(p.q, x - R, y) || inside(p.q, x, y + R) || inside(p.q, x, y - R)) { solid[j * W + i] = 1; break; }
      }
    }
  }
  const st = Z[ids[0]].start || [0, SURF - 1.2];
  let si = Math.round((st[0] - x0) / CELL), sj = Math.round((y1 - Math.min(st[1], SURF - 1.2)) / CELL);
  const seen = new Uint8Array(W * H), q = [sj * W + si];
  seen[q[0]] = 1;
  let deepest = y1;
  while (q.length) {
    const k = q.pop(), j = (k / W) | 0, i = k % W;
    deepest = Math.min(deepest, y1 - j * CELL);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj * W + ni;
      if (seen[nk] || solid[nk]) continue;
      seen[nk] = 1; q.push(nk);
    }
  }
  const got = S.layers.filter(L => deepest < L.yTop - 3).map(L => L.id);
  return { deepest, got, layers: S.layers, startSolid: !!solid[sj * W + si] };
}

const ids = Object.keys(Z), A = ids.filter(i => Z[i].area === 'A'), B = ids.filter(i => Z[i].area === 'B'), C = ids.filter(i => Z[i].area === 'C');
let bad = 0;
for (const a of A) for (const b of B.filter(b => Z[b].top === Z[a].bottom && !!Z[b].night === !!Z[a].night)) {
  const cs = Z[a].night ? [null] : C.filter(c => Z[c].top === Z[b].bottom);
  for (const c of cs) {
    const route = [a, b].concat(c ? [c] : []), r = reach(route);
    const full = r.got.length === route.length;
    if (!full) bad++;
    console.log((full ? 'ok  ' : 'KẸT ') + route.join('→').padEnd(16) + ' sâu tới y=' + r.deepest.toFixed(1) + ' (đáy ' + r.layers[r.layers.length - 1].yBot.toFixed(1) + ')' +
      ' tới được: ' + r.got.join(',') + (r.startSolid ? ' [điểm xuống nằm trong đá]' : ''));
  }
}
console.log(bad ? bad + ' lộ trình không xuống hết được' : 'mọi lộ trình xuống được tới tầng cuối');
process.exitCode = bad ? 1 : 0;
