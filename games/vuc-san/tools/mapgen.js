#!/usr/bin/env node
/*
 * Sinh điểm sinh thợ lặn, điểm sinh cá mập và chỗ đặt kho báu cho từng bản đồ trong data/maps.js từ lưới đi được, rồi kiểm:
 *   - mọi khoang cứu hộ nối nhau qua nước còn khoảng trống >= r của cá mập lớn nhất (data/sharks.js);
 *   - mọi chỗ kho báu tới được từ điểm sinh thợ lặn.
 * Dùng:  node games/vuc-san/tools/mapgen.js           ghi data/maps.js (giữ id, name, theme)
 *        node games/vuc-san/tools/mapgen.js --check   chỉ in và kiểm, không ghi
 * Cùng đầu vào cho cùng đầu ra: không dùng ngẫu nhiên.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require(path.join(__dirname, '..', '..', '..', 'test', 'vuc-san-lib.js'));

const MAPS_FILE = path.join(T.GAME, 'data', 'maps.js');
const N_SHARK_SPOTS = 10, SHARK_SPACING = 9, N_LOOT_SPOTS = 40, LOOT_SPACING = 6, LOOT_CLEAR = 0.8;
const round2 = (v) => Math.round(v * 100) / 100;
const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// Chọn tối đa count điểm từ cands (đã lọc) cách nhau >= spacing, xếp theo thứ tự cands.
function spread(cands, count, spacing) {
  const out = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.every((p) => d2(p[0], p[1], c[0], c[1]) >= spacing * spacing)) out.push(c);
  }
  return out;
}

// Điểm xa nhất từ những điểm đã chọn (farthest-point sampling): kho báu rải đều khắp bản đồ thay vì dồn một góc.
function farthest(cands, count, seeds) {
  const out = [], dmin = cands.map((c) => Math.min.apply(null, seeds.map((s) => d2(c[0], c[1], s[0], s[1]))));
  while (out.length < count && cands.length) {
    let bi = -1, bd = -1;
    for (let i = 0; i < cands.length; i++) if (dmin[i] > bd) { bd = dmin[i]; bi = i; }
    if (bd < LOOT_SPACING * LOOT_SPACING) break;
    const c = cands[bi];
    out.push(c);
    for (let i = 0; i < cands.length; i++) dmin[i] = Math.min(dmin[i], d2(cands[i][0], cands[i][1], c[0], c[1]));
  }
  return out;
}

// Nhãn vùng của ô thoáng gần (x,y) nhất trong bán kính rad; 0 nếu không có.
function nearestComp(g, x, y, rad) {
  let best = 0, bd = rad * rad;
  for (let dy = -rad; dy <= rad; dy += g.cell) for (let dx = -rad; dx <= rad; dx += g.cell) {
    const c = g.at(x + dx, y + dy);
    if (c && dx * dx + dy * dy <= bd) { bd = dx * dx + dy * dy; best = c; }
  }
  return best;
}

// Thợ lặn quanh điểm neo của mô phỏng, cách nhau hơn diverSpacing một chút để làm tròn 2 chữ số không kéo khoảng cách xuống dưới ngưỡng.
function placeDivers(w, g, anchor, n, K) {
  const pts = [[round2(anchor[0]), round2(anchor[1])]], sp = K.diverSpacing + 0.05, top = K.surfaceY - 1.5;
  for (let rad = sp; pts.length < n && rad < 30; rad += 0.5) {
    const cnt = Math.max(8, Math.ceil(2 * Math.PI * rad / 0.5));
    for (let k = 0; k < cnt && pts.length < n; k++) {
      const a = 2 * Math.PI * k / cnt, x = round2(anchor[0] + Math.cos(a) * rad), y = round2(anchor[1] + Math.sin(a) * rad);
      if (y > top || !w.open(x, y, K.spawnClear) || g.at(x, y) !== g.main) continue;
      if (pts.every((p) => d2(p[0], p[1], x, y) >= sp * sp)) pts.push([x, y]);
    }
  }
  return pts;
}

function inBounds(b, x, y, margin) {
  return x >= b.minX + margin && x <= b.maxX - margin && y >= b.minY + margin && y <= b.maxY - margin;
}

function maxSharkR(VS) {
  return Math.max.apply(null, Object.keys(VS.SHARKS).map((k) => VS.SHARKS[k].r));
}

// Dữ liệu sinh cho một bản đồ + kết quả kiểm. VS.MAPS[i] phải đang rỗng (divers/sharks/lootSpots) để mô phỏng dùng cách tự tìm chỗ làm gốc.
function generate(VS, map) {
  const K = VS.sim.K, TU = VS.TUNING, geom = VS.geom, rBig = maxSharkR(VS);
  const m = VS.sim.createMatch({ seed: 1, mapId: map.id });
  const w = m.world, gD = geom.reachGrid(w, K.navClear, K.navCell), gS = geom.reachGrid(w, rBig, K.navCell);
  const top = K.surfaceY - 3, rep = [];
  const divers = placeDivers(w, gD, m.spawns.diver[0], TU.match.divers, K);
  const ok = (cond, msg) => { rep.push({ ok: !!cond, msg }); };

  // Cá mập: ô của lưới cho cá mập lớn nhất (nên nơi nào cũng chứa vừa mọi loài), cùng vùng chính với thợ lặn, xa chỗ thả,
  // ngoài vùng an toàn của khoang cứu hộ; xếp sâu trước như match.js mong đợi.
  const anchor = divers[0], minD = K.sharkFar * (w.bounds.maxX - w.bounds.minX), safe = TU.pod.safeR + 2;
  const sc = [];
  for (let iy = 0; iy < gS.ny; iy += 2) for (let ix = 0; ix < gS.nx; ix += 2) {
    const i = iy * gS.nx + ix;
    if (gS.comp[i] !== gS.main) continue;
    const x = round2(gS.cx(i)), y = round2(gS.cy(i));
    if (y > top || !inBounds(w.bounds, x, y, rBig + 0.1) || d2(x, y, anchor[0], anchor[1]) < minD * minD) continue;
    if (m.pods.some((p) => d2(x, y, p.x, p.y) < safe * safe) || !w.open(x, y, K.sharkClear)) continue;
    if (m.pods.some((p) => d2(x, y, p.x, p.y) > d2(x, y, anchor[0], anchor[1]))) continue;   // mọi khoang gần cá mập hơn chỗ thả: thợ lặn hồi sinh ở chỗ thả khi trận mới mở là nơi xa cá mập nhất
    sc.push([x, y]);
  }
  sc.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const sharks = spread(sc, N_SHARK_SPOTS, SHARK_SPACING);

  // Kho báu: vùng chính của thợ lặn, đủ rộng cho món (r 0,8). Nằm ngoài mọi vùng sáng có sẵn lúc mở trận (chùm đèn từ chỗ thả, quầng khoang, quầng rương O2)
  // để đội phải đi soi mới thấy, không có món nào "biết" sẵn từ giây đầu.
  const V = TU.vision, lootFromSpawn = Math.max(K.lootFromSpawn, V.beamRange + 1), podClear = V.podGlow + 0.5, o2Clear = V.o2Glow + 0.5;
  const lc = [];
  for (let iy = 0; iy < gD.ny; iy += 2) for (let ix = 0; ix < gD.nx; ix += 2) {
    const i = iy * gD.nx + ix;
    if (gD.comp[i] !== gD.main) continue;
    const x = round2(gD.cx(i)), y = round2(gD.cy(i));
    if (y > top || !inBounds(w.bounds, x, y, LOOT_CLEAR) || !w.open(x, y, LOOT_CLEAR)) continue;
    if (divers.some((p) => d2(x, y, p[0], p[1]) < lootFromSpawn * lootFromSpawn)) continue;
    if (m.pods.some((p) => d2(x, y, p.x, p.y) < podClear * podClear) || m.o2.some((p) => d2(x, y, p.x, p.y) < o2Clear * o2Clear)) continue;
    lc.push([x, y]);
  }
  const lootSpots = farthest(lc, N_LOOT_SPOTS, divers).sort((p, q) => p[1] - q[1] || p[0] - q[0]);

  // Kiểm
  // Khoang là chỗ thợ lặn chạm trong pod.r nên neo mỗi khoang vào ô thoáng (cho cá mập lớn nhất) gần nhất trong pod.r.
  const podComp = m.pods.map((p) => nearestComp(gS, p.x, p.y, TU.pod.r));
  ok(m.pods.length >= 2 && podComp.every((c) => c !== 0 && c === podComp[0]),
    m.pods.length + ' khoang cứu hộ nối nhau với khoảng trống >= ' + rBig + ' m: nhãn vùng ' + podComp.join(','));
  ok(divers.length >= TU.match.divers && divers.every((p) => w.open(p[0], p[1], K.spawnClear) && gD.at(p[0], p[1]) === gD.main), divers.length + ' điểm sinh thợ lặn thoáng, cùng vùng chính');
  ok(sharks.length >= TU.match.sharks && sharks.every((p) => gS.at(p[0], p[1]) === gS.main), sharks.length + ' điểm sinh cá mập, cùng vùng chính');
  ok(lootSpots.length >= Math.max.apply(null, Object.keys(TU.loot.count).map((k) => TU.loot.count[k])),
    lootSpots.length + ' chỗ đặt kho báu (cần >= ' + Math.max.apply(null, Object.keys(TU.loot.count).map((k) => TU.loot.count[k])) + ')');
  const unreachable = lootSpots.filter((p) => gD.at(p[0], p[1]) !== gD.at(divers[0][0], divers[0][1]));
  ok(unreachable.length === 0, 'mọi chỗ kho báu tới được từ điểm sinh thợ lặn (' + unreachable.length + ' chỗ không tới được)');
  return { divers, sharks, lootSpots, report: rep };
}

function fmt(pts) { return '[' + pts.map((p) => '[' + p[0] + ', ' + p[1] + ']').join(', ') + ']'; }

function q(v) { return "'" + v + "'"; }

function render(maps, gen) {
  const head = fs.readFileSync(MAPS_FILE, 'utf8').split('\n(function')[0];
  const rows = maps.map((mp, i) => '    {\n      id: ' + q(mp.id) + ', name: ' + q(mp.name) + ', theme: ' + q(mp.theme) + ',\n' +
    '      divers: ' + fmt(gen[i].divers) + ',\n      sharks: ' + fmt(gen[i].sharks) + ',\n      lootSpots: ' + fmt(gen[i].lootSpots) + '\n    }');
  return head + '\n(function (VS) {\n  VS.MAPS = [\n' + rows.join(',\n') + '\n  ];\n})(window.VS = window.VS || {});\n';
}

// Sinh cho mọi bản đồ từ trạng thái rỗng, bất kể maps.js hiện có gì. Trả { maps, gen, text }.
function generateAll() {
  const VS = T.nodeSim(T.SIM_FILES).VS;
  const maps = VS.MAPS.map((mp) => ({ id: mp.id, name: mp.name, theme: mp.theme }));
  VS.MAPS.forEach((mp) => { mp.divers = []; mp.sharks = []; mp.lootSpots = []; });
  const gen = VS.MAPS.map((mp) => generate(VS, mp));
  return { VS, maps, gen, text: render(maps, gen) };
}

module.exports = { generateAll, generate, maxSharkR, MAPS_FILE };

if (require.main === module) {
  const write = process.argv.indexOf('--check') < 0;
  const r = generateAll();
  let bad = 0;
  r.maps.forEach((mp, i) => {
    const g = r.gen[i];
    console.log(mp.id + ' ' + mp.name + ': thợ lặn ' + g.divers.length + ', cá mập ' + g.sharks.length + ', kho báu ' + g.lootSpots.length);
    g.report.forEach((x) => { console.log('  ' + (x.ok ? 'ok   ' : 'LỖI ') + x.msg); if (!x.ok) bad++; });
  });
  if (bad) { console.error(bad + ' kiểm hỏng, không ghi ' + path.relative(T.ROOT, MAPS_FILE)); process.exit(1); }
  if (write) { fs.writeFileSync(MAPS_FILE, r.text); console.log('đã ghi ' + path.relative(T.ROOT, MAPS_FILE)); }
}
