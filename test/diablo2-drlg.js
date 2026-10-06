// node test/diablo2-drlg.js : D2G.build cho 3 màn x 50 seed, kiểm đi được và kích thước.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.join(__dirname, '..', 'games', 'diablo2');
['world.js', 'maps.js'].forEach(function (f) { vm.runInThisContext(fs.readFileSync(path.join(root, 'assets', f), 'utf8')); });
var D2G = require(path.join(root, 'js', 'drlg.js'));

var fails = 0;
function fail(msg) { fails++; if (fails < 20) console.log('FAIL ' + msg); }

function reach(lv, eight) {
  var w = lv.w, seen = new Uint8Array(w * lv.h), q = [lv.hero[1] * w + lv.hero[0]];
  seen[q[0]] = 1;
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (eight) dirs = dirs.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  for (var h = 0; h < q.length; h++) {
    var cx = q[h] % w, cy = (q[h] / w) | 0;
    for (var d = 0; d < dirs.length; d++) {
      var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= lv.h) continue;
      var ni = ny * w + nx;
      if (!seen[ni] && lv.col[ni] === 0) { seen[ni] = 1; q.push(ni); }
    }
  }
  return seen;
}

var SIZES = { rogue_encampment: [57, 41], blood_moor: [80, 80] };
var EXPECT_EXITS = { rogue_encampment: ['blood_moor'], blood_moor: ['rogue_encampment', 'den_of_evil'], den_of_evil: ['blood_moor'] };
var stats = [];
D2G.areas.forEach(function (area) {
  var t0 = Date.now(), exits = 0, spawns = 0, walk = 0, n = 50, tmax = 0;
  for (var seed = 1; seed <= n; seed++) {
    var t1 = Date.now(), lv;
    try { lv = D2G.build(area, seed); } catch (e) { fail(area + ' ' + seed + ' throw ' + e.message); continue; }
    tmax = Math.max(tmax, Date.now() - t1);
    var tag = area + ' seed ' + seed;
    if (lv.w !== lv.tw * 5 || lv.h !== lv.th * 5 || lv.col.length !== lv.w * lv.h) fail(tag + ' kích thước không khớp');
    if (SIZES[area] && (lv.tw !== SIZES[area][0] || lv.th !== SIZES[area][1])) fail(tag + ' sai cỡ ' + lv.tw + 'x' + lv.th);
    if (lv.floors[0].length !== lv.tw * lv.th || lv.walls.some(function (L) { return L.t.length !== lv.tw * lv.th; })) fail(tag + ' lớp tile sai độ dài');
    if (lv.col[lv.hero[1] * lv.w + lv.hero[0]] !== 0) fail(tag + ' hero đứng trên ô chặn');
    var codes = lv.exits.map(function (e) { return e.to; }).sort().join();
    if (codes !== EXPECT_EXITS[area].slice().sort().join()) fail(tag + ' lối ra ' + codes);
    [false, true].forEach(function (eight) {
      var seen = reach(lv, eight);
      lv.exits.forEach(function (e) { if (!seen[e.y * lv.w + e.x]) fail(tag + ' lối ra ' + e.to + ' không tới được (' + (eight ? 8 : 4) + ')'); });
      lv.spawns.forEach(function (s) { if (!seen[s.y * lv.w + s.x]) fail(tag + ' spawn ' + s.x + ',' + s.y + ' không tới được'); });
    });
    var again = D2G.build(area, seed);
    if (again.col.some(function (v, i) { return v !== lv.col[i]; }) || again.hero.join() !== lv.hero.join()) fail(tag + ' không tất định');
    exits += lv.exits.length; spawns += lv.spawns.length;
    for (var i = 0; i < lv.col.length; i++) if (lv.col[i] === 0) walk++;
  }
  stats.push(area + ': ' + n + ' seed, exits ' + exits + ', spawns ' + spawns + ', ô đi được TB ' + Math.round(walk / n) +
    ', ' + Math.round((Date.now() - t0) / n / 2) + ' ms/build (max ' + tmax + ')');
});
stats.forEach(function (s) { console.log(s); });
console.log(fails ? 'diablo2-drlg: ' + fails + ' FAIL' : 'diablo2-drlg: all passed');
process.exit(fails ? 1 : 0);
