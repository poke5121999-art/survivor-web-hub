// node test/diablo2-drlg.js : kiểm DRLG của Diablo II (games/diablo2/js/drlg.js)
'use strict';
var fs = require('fs'), path = require('path');
global.window = global;
var dir = path.join(__dirname, '..', 'games', 'diablo2');

function tryLoad(rel) {
  var p = path.join(dir, rel);
  if (!fs.existsSync(p)) return false;
  try { require(p); return true; } catch (e) { console.log('  (không nạp được ' + rel + ': ' + e.message + ')'); return false; }
}
var realAssets = tryLoad('assets/manifest.js') && window.D2_ASSETS && window.D2_ASSETS.autotile;
var realData = tryLoad('js/data.js') && window.D2DATA && window.D2DATA.areas;
console.log('manifest: ' + (realAssets ? 'THẬT' : 'stub') + ', data: ' + (realData ? 'THẬT' : 'stub'));

function stubTs(base) {
  var walls = {};
  [255, 254, 253, 251, 247, 239, 223, 191, 127, 1, 4, 16, 64, 28, 112, 193, 7, 31, 124, 241].forEach(function (m, i) { walls[m] = [[base + 10 + i, 1]]; });
  return { floor: [[base, 5], [base + 1, 1]], deco: [[base + 2, 1], [base + 3, 1]], blockers: [[base + 4, 1], [base + 5, 1]], walls: walls };
}
if (!realAssets) {
  window.D2_ASSETS = window.D2_ASSETS || {};
  window.D2_ASSETS.autotile = { grassland: stubTs(100), cave: stubTs(200), dungeon: stubTs(300) };
}
if (!realData) {
  window.D2DATA = window.D2DATA || {};
  window.D2DATA.areas = {
    rogue_encampment: { id: 'rogue_encampment', layout: 'preset', tileset: 'grassland', size: [36, 30], density: 0 },
    blood_moor: { id: 'blood_moor', layout: 'outdoor', tileset: 'grassland', size: [80, 80], density: 520 },
    den_of_evil: { id: 'den_of_evil', layout: 'cave', tileset: 'cave', size: [200, 200], playSize: [48, 48], density: 600 }
  };
}

var D2G = require(path.join(dir, 'js', 'drlg.js'));
var fails = 0;
function check(name, ok, extra) {
  console.log((ok ? '✔ ' : '✘ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) fails++;
}
function sig(g) {
  var h = 2166136261;
  function mix(a) { for (var i = 0; i < a.length; i++) { h ^= a[i] + 1; h = Math.imul(h, 16777619); } }
  mix(g.col); mix(g.bg); mix(g.obj); mix(g.hero);
  g.spawns.forEach(function (s) { mix([s.x, s.y, s.n, s.kind.length]); });
  g.exits.forEach(function (s) { mix([s.x, s.y]); });
  return (h >>> 0) + ':' + g.w + 'x' + g.h;
}

var ids = ['rogue_encampment', 'blood_moor', 'den_of_evil'];
ids.forEach(function (id) {
  var area = Array.isArray(D2DATA.areas) ? D2DATA.areas.filter(function (a) { return a.id === id; })[0] : D2DATA.areas[id];
  if (!area) { check(id + ': có trong D2DATA.areas', false); return; }
  var outdoor = id === 'blood_moor', preset = id === 'rogue_encampment';
  var colSigs = [], bad = { reach: [], hero: [], dist: [], shape: [], det: [], unique: [], exits: [], wall: [], bg0: [], size: [] }, sigs = {}, walkFr = [], packs = [];
  var t0 = Date.now();
  for (var seed = 1; seed <= 50; seed++) {
    var g = D2G.build(id, seed), g2 = D2G.build(id, seed), n = g.w * g.h;
    if (sig(g) !== sig(g2)) bad.det.push(seed);
    sigs[sig(g)] = 1; var cs = Array.prototype.join.call(g.col, ''); if (colSigs.indexOf(cs) < 0) colSigs.push(cs);
    if (g.bg.length !== n || g.obj.length !== n || g.col.length !== n || g.id !== id) bad.shape.push(seed);
    if (g.col[g.hero[1] * g.w + g.hero[0]] !== 0) bad.hero.push(seed);
    var dist = D2G.bfs(g, g.hero[0], g.hero[1]);
    g.exits.concat(g.spawns).forEach(function (p) {
      if (p.x < 0 || p.y < 0 || p.x >= g.w || p.y >= g.h || dist[p.y * g.w + p.x] < 0) bad.reach.push(seed + '@' + p.x + ',' + p.y);
    });
    if (outdoor) g.spawns.forEach(function (s) { if (Math.hypot(s.x - g.hero[0], s.y - g.hero[1]) < 40) bad.dist.push(seed); });
    if (realData) {   // kích thước theo D2 tiles * CELLS_PER_D2_TILE (2.5), viết thẳng số
      var wantW = { rogue_encampment: 140, blood_moor: 200, den_of_evil: 120 }[id], wantH = { rogue_encampment: 100, blood_moor: 200, den_of_evil: 120 }[id];
      if (g.w !== wantW || g.h !== wantH) bad.size.push(seed + ':' + g.w + 'x' + g.h);
    }
    var walkN = 0; for (var q0 = 0; q0 < n; q0++) if (g.col[q0] === 0) walkN++;
    walkFr.push(walkN / n); packs.push(g.spawns.length);
    if (id === 'den_of_evil' && !g.spawns.some(function (s) { return s.kind === 'unique' && s.id === 'corpsefire'; })) bad.unique.push(seed);
    var want = outdoor ? ['rogue_encampment', 'cold_plains', 'den_of_evil'] : id === 'den_of_evil' ? ['blood_moor'] : [];
    want.forEach(function (to) { if (!g.exits.some(function (e) { return e.to === to; })) bad.exits.push(seed + ':' + to); });
    if (true) {
      // mọi ô chặn có tile obj != 0 khi autotile có sẵn
      if (!preset) for (var i = 0; i < n; i++) if (g.col[i] === 1 && g.obj[i] === 0) { bad.wall.push(seed); break; }
      for (var i2 = 0; i2 < n; i2++) if (g.col[i2] !== 0 && g.bg[i2] === 0) { bad.bg0.push(seed); break; }
    }
  }
  var ms = Date.now() - t0;
  check(id + ': 50 seed, mọi cửa/đàn quái tới được từ hero', !bad.reach.length, bad.reach.slice(0, 3).join(' '));
  check(id + ': hero đứng trên ô đi được', !bad.hero.length);
  check(id + ': kích thước mảng khớp w*h', !bad.shape.length);
  check(id + ': cùng seed -> cùng lưới', !bad.det.length);
  if (outdoor) check(id + ': không đàn nào trong 40 ô quanh hero', !bad.dist.length);
  if (realData) check(id + ': kích thước lưới đúng (town 140x100, Blood Moor 200x200, Den 120x120)', !bad.size.length, bad.size.slice(0, 3).join(' '));
  if (realData && outdoor) check(id + ': 15..35 đàn (MonDen 520 trên ~28000 ô đi được)', Math.min.apply(null, packs) >= 15 && Math.max.apply(null, packs) <= 35, Math.min.apply(null, packs) + '..' + Math.max.apply(null, packs));
  if (id === 'den_of_evil') check(id + ': ô đi được 20%..38% mọi seed (hang quanh co)', Math.min.apply(null, walkFr) >= 0.20 && Math.max.apply(null, walkFr) <= 0.38,
    Math.min.apply(null, walkFr).toFixed(3) + '..' + Math.max.apply(null, walkFr).toFixed(3));
  if (id === 'den_of_evil') check(id + ': 6..12 đàn (kể cả Corpsefire)', Math.min.apply(null, packs) >= 6 && Math.max.apply(null, packs) <= 12, Math.min.apply(null, packs) + '..' + Math.max.apply(null, packs));
  if (!preset) check(id + ': các seed cho lưới khác nhau', Object.keys(sigs).length >= 48, Object.keys(sigs).length + '/50');
  else check(id + ': preset cố định (col giống nhau mọi seed)', colSigs.length === 1);
  if (id === 'den_of_evil') check(id + ': có Corpsefire (unique)', !bad.unique.length);
  if (outdoor || id === 'den_of_evil') check(id + ': đủ cửa (' + (outdoor ? 'camp, cold_plains, den' : 'blood_moor') + ')', !bad.exits.length, bad.exits.slice(0, 3).join(' '));
  if (!preset) check(id + ': ô tường đều có tile obj', !bad.wall.length);
  check(id + ': không ô chặn nào có bg 0 (lỗ đen)', !bad.bg0.length, bad.bg0.slice(0, 3).join(' '));
  var g1 = D2G.build(id, 1);
  var walk = 0; for (var q = 0; q < g1.col.length; q++) if (g1.col[q] === 0) walk++;
  console.log('   ' + id + ' seed1: ' + g1.w + 'x' + g1.h + ', đi được ' + Math.round(100 * walk / g1.col.length) + '%, đàn ' + g1.spawns.length +
    ', vật ' + g1.objects.length + ', npc ' + g1.npcs.length + ', ' + (ms / 100).toFixed(1) + ' ms/lưới');
  if (id !== 'rogue_encampment') {
    console.log(D2G.ascii(g1, 2).split('\n').join('\n   '));
  }
});

// ---- Doanh trại: kiểm theo chữ ----
(function () {
  var g = D2G.build('rogue_encampment', 1), area = D2DATA.areas.rogue_encampment;
  function count(id) { return g.npcs.filter(function (n) { return n.id === id; }).length; }
  ['akara', 'charsi', 'gheed', 'kashya', 'warriv'].forEach(function (id) { check('camp: đúng 1 ' + id, count(id) === 1, 'có ' + count(id)); });
  check('camp: chỉ 5 npc', g.npcs.length === 5, '' + g.npcs.length);
  check('camp: có lối ra blood_moor', g.exits.length > 0 && g.exits.every(function (e) { return e.to === 'blood_moor'; }));
  check('camp: data.exits là mảng, có west và south', Array.isArray(area.exits) && area.exits.some(function (e) { return e.side === 'west'; }) && area.exits.some(function (e) { return e.side === 'south'; }));
  function objs(t) { return g.objects.filter(function (o) { return o.type === t; }); }
  var rows = area.preset, tents = 0, seenT = {};
  // số cụm 'T' kề nhau trong preset = số tent trong grid
  (function () {
    var H = rows.length, W = rows[0].length;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (rows[y][x] === 'T' && !seenT[y * W + x]) {
      tents++; var st = [[x, y]]; seenT[y * W + x] = 1;
      while (st.length) { var c = st.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1]; if (nx >= 0 && ny >= 0 && nx < W && ny < H && rows[ny][nx] === 'T' && !seenT[ny * W + nx]) { seenT[ny * W + nx] = 1; st.push([nx, ny]); } }); }
    }
  })();
  check('camp: mỗi lều là MỘT vật (' + tents + ' lều)', tents > 0 && objs('tent').length === tents && objs('tent').every(function (o) { return o.w >= 2 && o.h >= 2; }), objs('tent').length + ' vật');
  ['forge', 'wagon', 'caravan', 'campfire', 'waypoint', 'stash'].forEach(function (t) { check('camp: có vật ' + t, objs(t).length >= 1); });
  check('camp: lò rèn/lửa trại/waypoint mỗi loại 1 vật', objs('forge').length === 1 && objs('campfire').length === 1 && objs('waypoint').length === 1);
  var noBg = 0, i; for (i = 0; i < g.col.length; i++) if (g.col[i] !== 0 && g.bg[i] === 0) noBg++;
  check('camp: không ô chặn nào có bg 0', noBg === 0);
  var at = D2_ASSETS.autotile.grassland || {}, fenceTiles = {}, x, y;
  Object.keys(at.fence || {}).forEach(function (k) { at.fence[k].forEach(function (e) { fenceTiles[e[0]] = 1; }); });
  var fcells = [];
  for (y = 0; y < g.h; y++) for (x = 0; x < g.w; x++) if (fenceTiles[g.obj[y * g.w + x]] && g.col[y * g.w + x] === 1) fcells.push(y * g.w + x);
  // mỗi ký tự # nguồn (1 ô D2) phải có ít nhất 1 ô hàng rào trong khối 2.5x2.5 của nó
  var srcFence = 0, srcHit = 0, S = D2G.CELLS_PER_D2_TILE;
  for (y = 0; y < rows.length; y++) for (x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') {
    srcFence++; var hit = false;
    for (var yy = Math.ceil(y * S); yy < Math.ceil((y + 1) * S); yy++) for (var xx = Math.ceil(x * S); xx < Math.ceil((x + 1) * S); xx++)
      if (fenceTiles[g.obj[yy * g.w + xx]]) hit = true;
    if (hit) srcHit++;
  }
  check('camp: mọi ô # nguồn có hàng rào trong khối của nó', srcFence > 0 && srcHit === srcFence, srcHit + '/' + srcFence);
  // liền mạch: hàng rào chia thành đúng 2 cụm 4-hướng nối được? Không: vòng rào bị cắt bởi 2 cổng nên là 1 cụm hở (một chuỗi) hoặc 2 chuỗi.
  var fset = {}, comps = 0, fi;
  fcells.forEach(function (c) { fset[c] = 1; });
  fcells.forEach(function (c) {
    if (fset[c] !== 1) return; comps++; var st = [c]; fset[c] = 2;
    while (st.length) {
      var q = st.pop(), qx = q % g.w, qy = (q - qx) / g.w;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = qx + d[0], ny = qy + d[1], ni = ny * g.w + nx; if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h && fset[ni] === 1) { fset[ni] = 2; st.push(ni); } });
    }
  });
  // 2 cổng cắt vòng thành 2 chuỗi; mỗi chuỗi phải là MỘT cụm 4-hướng (không đứt giữa đoạn)
  check('camp: hàng rào sau khi phóng vẫn liền mạch (2 cổng -> 2 chuỗi 4-hướng)', comps === 2, comps + ' cụm, ' + fcells.length + ' ô');
  var gateW = 0; for (y = 0; y < g.h; y++) if (g.exits.some(function (e) { return e.x === 0 && e.y === y; })) gateW++;
  check('camp: lối ra tây rộng trọn cổng (4 ô D2 = 10 ô)', gateW === 10, '' + gateW);
  check('camp: waypoint/lửa trại là 1 vật phóng theo khối (>= 4 ô mỗi chiều)', objs('waypoint')[0].w >= 4 && objs('campfire')[0].w >= 4 && objs('forge')[0].h >= 4);
  var hc = D2G.build('rogue_encampment', 1).hero; check('camp: hero ở tâm khối nguồn (68,58 = tâm ô 27,23)', hc[0] === 68 && hc[1] === 58, hc.join(','));
  var tw = D2_ASSETS.townObjects || {}, missing = [];
  g.objects.forEach(function (o) { if (!tw[o.type]) missing.push(o.type); });
  check('camp: mọi vật có trong D2_ASSETS.townObjects', !missing.length, missing.join(','));
  check('manifest: powerIcons có fireball', D2_ASSETS.powerIcons && typeof D2_ASSETS.powerIcons.fireball === 'number');
})();

check('area lạ -> ném lỗi', (function () { try { D2G.build('nope', 1); return false; } catch (e) { return true; } })());
console.log(fails ? '\nTHẤT BẠI: ' + fails : '\nTất cả đạt');
process.exit(fails ? 1 : 0);
