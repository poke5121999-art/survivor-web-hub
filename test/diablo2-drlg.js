// node test/diablo2-drlg.js [seeds] [--act N[,M]] [area...] : D2G v2 (games/diablo2/js/drlg.js) for every area
// of the chosen acts (default: every act whose assets/m/maps_act<N>.js exists; env D2_ACT=N[,M] works too).
// Per area and seed: sizes, hero on a walkable subtile, every exit and spawn reachable from the hero
// (BFS on col == 0, 4-neighbour), exits only to areas in links / vis, an exit for every same-act link the
// generator supports, waypoint object where levels.txt has one, same seed -> same level. Prints build times.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.join(__dirname, '..', 'games', 'diablo2');
global.D2_GROUPS = {};
global.D2_REG = function (name, obj) { global.D2_GROUPS[name] = obj; };
function load(f) { vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }); }
load('js/data.js');

var argv = process.argv.slice(2);
var SEEDS = argv[0] && /^\d+$/.test(argv[0]) ? +argv.shift() : 20;
var actArg = process.env.D2_ACT || '', ai = argv.indexOf('--act');
if (ai >= 0) { actArg = argv[ai + 1] || ''; argv.splice(ai, 2); }
var ACTS = actArg ? actArg.split(',').map(Number) : [1, 2, 3, 4, 5].filter(function (n) {
  return fs.existsSync(path.join(root, 'assets', 'm', 'maps_act' + n + '.js'));
});
ACTS.forEach(function (n) {
  ['maps', 'world'].forEach(function (g) {
    var f = 'assets/m/' + g + '_act' + n + '.js';
    if (!fs.existsSync(path.join(root, f))) { console.log('diablo2-drlg: ' + f + ' not found (act ' + n + ' not built)'); process.exit(1); }
    load(f);
  });
});
var D2G = require(path.join(root, 'js', 'drlg.js'));
var A = global.D2DATA.areas;
var all = Object.keys(A).filter(function (k) { return ACTS.indexOf(A[k].act) >= 0; })
  .sort(function (a, b) { return A[a].d2id - A[b].d2id; });
var only = argv.length ? argv : null;

var fails = 0;
function fail(msg) { fails++; if (fails < 60) console.log('FAIL ' + msg); }

function reach(lv) {
  var w = lv.w, seen = new Uint8Array(w * lv.h), q = [lv.hero[1] * w + lv.hero[0]];
  seen[q[0]] = 1;
  for (var h = 0; h < q.length; h++) {
    var cx = q[h] % w, cy = (q[h] / w) | 0;
    for (var d = 0; d < 4; d++) {
      var nx = cx + [1, -1, 0, 0][d], ny = cy + [0, 0, 1, -1][d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= lv.h) continue;
      var ni = ny * w + nx;
      if (!seen[ni] && lv.col[ni] === 0) { seen[ni] = 1; q.push(ni); }
    }
  }
  return { seen: seen, n: q.length };
}
function nearReach(r, lv, x, y, rad) {
  for (var yy = Math.max(0, y - rad); yy <= Math.min(lv.h - 1, y + rad); yy++) {
    for (var xx = Math.max(0, x - rad); xx <= Math.min(lv.w - 1, x + rad); xx++) if (r.seen[yy * lv.w + xx]) return true;
  }
  return false;
}
function sig(lv) {
  var h = 0;
  for (var i = 0; i < lv.col.length; i++) h = (Math.imul(h, 31) + lv.col[i]) | 0;
  lv.floors.forEach(function (L) { for (var j = 0; j < L.length; j++) h = (Math.imul(h, 31) + L[j]) | 0; });
  return h + '|' + lv.hero.join() + '|' + JSON.stringify(lv.exits) + '|' + JSON.stringify(lv.spawns) + '|' + lv.objects.length;
}

var rows = [], unsupported = [];
all.forEach(function (id) {
  if (only && only.indexOf(id) < 0) return;
  if (!D2G.supports(id)) { unsupported.push(id); return; }
  var a = A[id], allowed = {};
  (a.links || []).forEach(function (t) { allowed[t] = 1; });
  (a.vis || []).forEach(function (t) { allowed[t] = 1; });
  // links to another act (Durance -> Pandemonium Fortress, Harrogath -> Uber levels) are quest portals, not exits
  var need = (a.links || []).filter(function (t) { return A[t] && A[t].act === a.act && D2G.supports(t); });
  var tsum = 0, tmax = 0, ex = 0, sp = 0, walk = 0, size = '';
  for (var seed = 1; seed <= SEEDS; seed++) {
    var tag = id + ' seed ' + seed, lv, t0 = Date.now();
    try { lv = D2G.build(id, seed); } catch (e) { fail(tag + ' throws ' + e.message); continue; }
    var dt = Date.now() - t0; tsum += dt; tmax = Math.max(tmax, dt);
    size = lv.tw + 'x' + lv.th + ' ' + lv.tileset;
    if (lv.w !== lv.tw * 5 || lv.h !== lv.th * 5 || lv.col.length !== lv.w * lv.h) fail(tag + ' size mismatch');
    if (lv.floors.some(function (L) { return L.length !== lv.tw * lv.th; }) ||
        lv.walls.some(function (L) { return L.t.length !== lv.tw * lv.th || L.o.length !== lv.tw * lv.th; })) fail(tag + ' layer length');
    if (lv.col[lv.hero[1] * lv.w + lv.hero[0]] !== 0) fail(tag + ' hero on a blocked subtile');
    var r = reach(lv);
    walk += r.n;
    lv.exits.forEach(function (e) {
      if (!allowed[e.to]) fail(tag + ' exit to ' + e.to + ' not in links/vis');
      if (!r.seen[e.y * lv.w + e.x]) fail(tag + ' exit to ' + e.to + ' unreachable');
    });
    need.forEach(function (t) { if (!lv.exits.some(function (e) { return e.to === t; })) fail(tag + ' no exit to ' + t); });
    lv.spawns.forEach(function (s) { if (!r.seen[s.y * lv.w + s.x]) fail(tag + ' spawn ' + s.x + ',' + s.y + ' unreachable'); });
    var wps = lv.objects.filter(function (o) { return o.kind === 'waypoint'; });
    if (a.waypoint && !wps.length) fail(tag + ' waypoint missing');
    if (!a.waypoint && wps.length) fail(tag + ' unexpected waypoint');
    wps.forEach(function (o) { if (!nearReach(r, lv, Math.round(o.x), Math.round(o.y), 8)) fail(tag + ' waypoint unreachable'); });
    // `from` puts the hero at the exit back to that area
    if (lv.exits.length) {
      var e0 = lv.exits[lv.exits.length - 1], lf = D2G.build(id, seed, e0.to);
      var d = Math.abs(lf.hero[0] - e0.x) + Math.abs(lf.hero[1] - e0.y);
      if (d > 45) fail(tag + ' from=' + e0.to + ' hero ' + d + ' subtiles from that exit');
    }
    if (sig(D2G.build(id, seed)) !== sig(lv)) fail(tag + ' not deterministic');
    ex += lv.exits.length; sp += lv.spawns.length;
  }
  rows.push('a' + a.act + ' ' + id + ' [' + D2G.kind(id) + ' ' + size + ']: exits ' + (ex / SEEDS).toFixed(1) + ', spawns ' + (sp / SEEDS).toFixed(1) +
    ', walkable ' + Math.round(walk / SEEDS) + ', ' + Math.round(tsum / SEEDS) + ' ms/build (max ' + tmax + ')');
});
rows.forEach(function (s) { console.log(s); });
if (unsupported.length) console.log('not supported: ' + unsupported.join(', '));
var n = rows.length;
console.log(fails ? 'diablo2-drlg: ' + fails + ' FAIL (' + n + ' areas x ' + SEEDS + ' seeds)' :
  'diablo2-drlg: all passed (' + n + ' areas x ' + SEEDS + ' seeds, acts ' + ACTS.join(',') + ')');
process.exit(fails ? 1 : 0);
