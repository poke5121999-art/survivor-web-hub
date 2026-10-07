// node test/diablo2-drlg.js [seeds] [--act N[,M]] [area...] : D2G v2 (games/diablo2/js/drlg.js) for every area
// of the chosen acts (default: every act whose assets/m/maps_act<N>.js exists; env D2_ACT=N[,M] works too).
// Per area and seed: sizes, hero on a walkable subtile, every exit and spawn reachable from the hero
// (BFS on col == 0, 4-neighbour), exits only to areas in links / vis, an exit for every same-act link the
// generator supports, waypoint object where levels.txt has one, same seed -> same level. Prints build times.
// Then per act seed (D2G.layoutAct): both ends of every walking link open onto the same world point, the
// D2MOO placement rules (Tamoe +y of the gate, Siege -x of Harrogath, ...) hold, the two non-links stay absent.
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
// ---------------------------------------------------------------- act layouts (D2G.layoutAct)
// Per act seed: every walking link of the act's areas is placed; both levels, built with the layout and their
// own D2G.levelSeed, open onto the same world point (exits within 1 tile along the shared edge, next to it);
// the D2MOO placement rules hold; the two links D2 never walks are absent.
var layoutRows = [];
function walkPairs(act) {
  var out = {};
  all.forEach(function (id) {
    if (A[id].act !== act || !D2G.supports(id)) return;
    D2G.linksOf(id).forEach(function (l) {
      if (l.walk && D2G.supports(l.to)) out[id < l.to ? id + '|' + l.to : l.to + '|' + id] = 1;
    });
  });
  return out;
}
if (!only) ACTS.forEach(function (act) {
  var pairs = walkPairs(act), worst = 0, nLinks = 0, sides = {};
  for (var s = 1; s <= SEEDS; s++) {
    var aseed = D2G.actSeed(s, 'n', act), W = D2G.layoutAct(act, aseed), tag = 'act ' + act + ' layout ' + aseed;
    if (JSON.stringify(D2G.layoutAct(act, aseed)) !== JSON.stringify(W)) fail(tag + ' not deterministic');
    var placed = {}, built = {};
    W.links.forEach(function (L) { placed[L.a < L.b ? L.a + '|' + L.b : L.b + '|' + L.a] = L; });
    // the maze walks (River of Flame - Chaos Sanctuary, Outer Cloister - Barracks) are not outdoor placements
    Object.keys(pairs).forEach(function (k) {
      var ab = k.split('|');
      if (W.levels[ab[0]] && W.levels[ab[1]] && !placed[k]) fail(tag + ' walking link ' + k + ' not placed');
    });
    function lv(id) { return built[id] || (built[id] = D2G.build(id, D2G.levelSeed(W.seed, id), null, { layout: W })); }
    W.links.forEach(function (L) {
      nLinks++;
      (sides[L.a + '>' + L.b] = sides[L.a + '>' + L.b] || {})[L.side] = 1;
      var ra = W.levels[L.a].rect, rb = W.levels[L.b].rect, hz = L.side === 'n' || L.side === 's';
      var ea = lv(L.a).exits.filter(function (e) { return e.to === L.b; })[0], eb = lv(L.b).exits.filter(function (e) { return e.to === L.a; })[0];
      if (!ea || !eb) { fail(tag + ' ' + L.a + ' / ' + L.b + ' exit missing'); return; }
      var wa = [ra[0] * 5 + ea.x + 0.5, ra[1] * 5 + ea.y + 0.5], wb = [rb[0] * 5 + eb.x + 0.5, rb[1] * 5 + eb.y + 0.5];
      var along = Math.abs(hz ? wa[0] - wb[0] : wa[1] - wb[1]), line = hz ? L.edge[1] : L.edge[0];
      var na = Math.abs((hz ? wa[1] : wa[0]) - line), nb = Math.abs((hz ? wb[1] : wb[0]) - line);
      var lo = hz ? L.edge[0] : L.edge[1], hi = hz ? L.edge[2] : L.edge[3], mid = hz ? wa[0] : wa[1];
      worst = Math.max(worst, along);
      if (along > 5) fail(tag + ' ' + L.a + ' > ' + L.b + ': openings ' + along.toFixed(1) + ' subtiles apart along the edge');
      if (na > 5 || nb > 5) fail(tag + ' ' + L.a + ' > ' + L.b + ': exit ' + Math.max(na, nb).toFixed(1) + ' subtiles off the shared edge');
      if (mid < lo || mid > hi) fail(tag + ' ' + L.a + ' > ' + L.b + ': opening outside the shared edge');
    });
    var side = function (a, b) {
      var L = W.links.filter(function (x) { return (x.a === a && x.b === b) || (x.a === b && x.b === a); })[0];
      return !L ? null : L.a === a ? L.side : { n: 's', s: 'n', e: 'w', w: 'e' }[L.side];
    };
    var lvl = W.levels;
    if (act === 1) {
      if (side('monastery_gate', 'tamoe_highland') !== 's') fail(tag + ' Tamoe Highland not on +y of the Monastery Gate');
      var bm = lvl.blood_moor.rect;
      if (!((bm[2] === 56 && bm[3] === 96) || (bm[2] === 96 && bm[3] === 56))) fail(tag + ' Blood Moor ' + bm[2] + 'x' + bm[3]);
      // the town DS1 (TownN1 / E1 / S1 / W1) opens on the side the layout rolled
      var re = lv('rogue_encampment'), ex = re.exits.filter(function (e) { return e.to === 'blood_moor'; })[0], sd = side('rogue_encampment', 'blood_moor');
      var onEdge = { n: ex.y < 10, s: ex.y > re.h - 10, w: ex.x < 10, e: ex.x > re.w - 10 }[sd];
      if (!onEdge) fail(tag + ' Rogue Encampment exit ' + ex.x + ',' + ex.y + ' not on its ' + sd + ' edge');
    }
    if (act === 2) {
      var rw = side('lut_gholein', 'rocky_waste');
      if (rw !== 'w' && rw !== 'n') fail(tag + ' Rocky Waste on side ' + rw + ' of Lut Gholein');
    }
    if (act === 4 && side('the_pandemonium_fortress', 'outer_steppes') !== 'e') fail(tag + ' Outer Steppes not on +x of the Fortress');
    if (act === 5) {
      // Siege on -x of Harrogath with "To Town" at its east end, Frigid Highlands further -x
      if (side('harrogath', 'bloody_foothills') !== 'w') fail(tag + ' Bloody Foothills not on -x of Harrogath');
      if (side('bloody_foothills', 'frigid_highlands') !== 'w') fail(tag + ' Frigid Highlands not on -x of the Bloody Foothills');
      var bf = lv('bloody_foothills'), toTown = bf.exits.filter(function (e) { return e.to === 'harrogath'; })[0];
      var toFrigid = bf.exits.filter(function (e) { return e.to === 'frigid_highlands'; })[0];
      if (!(toTown.x > bf.w - 40 && toFrigid.x < 40)) fail(tag + ' Bloody Foothills exits: town ' + toTown.x + ', Frigid ' + toFrigid.x + ' (w ' + bf.w + ')');
      var P5 = global.D2_GROUPS['m/maps_act5'].presets, parts = lvl.bloody_foothills.parts || [];
      if (P5[865].files.indexOf(parts[parts.length - 1]) < 0 || P5[879].files.indexOf(parts[0]) < 0) {
        fail(tag + ' Siege strip not "To Barricade" ... "To Town" from west to east: ' + parts[0] + ' ... ' + parts[parts.length - 1]);
      }
      var hg = lv('harrogath').exits.filter(function (e) { return e.to === 'bloody_foothills'; })[0];
      if (hg.x > 10) fail(tag + ' Harrogath exit to the Siege at x ' + hg.x + ', not on its west edge');
    }
  }
  if (nLinks) layoutRows.push('act ' + act + ' layout: ' + SEEDS + ' seeds, ' + nLinks + ' walking links, openings at most ' + worst.toFixed(1) +
    ' subtiles apart; sides ' + Object.keys(sides).map(function (k) { return k + ' ' + Object.keys(sides[k]).sort().join(''); }).join(', '));
});
// D2MOO DrlgOutPlace.cpp: Stony Field / Dark Wood and Valley of Snakes / Canyon of the Magi are in different link groups
[['stony_field', 'dark_wood'], ['valley_of_snakes', 'canyon_of_the_magi']].forEach(function (p) {
  if (!A[p[0]] || ACTS.indexOf(A[p[0]].act) < 0) return;
  [p, [p[1], p[0]]].forEach(function (q) {
    if (D2G.linksOf(q[0]).some(function (l) { return l.to === q[1]; })) fail(q[0] + ' still links to ' + q[1]);
    if (D2G.build(q[0], 1).exits.some(function (e) { return e.to === q[1]; })) fail(q[0] + ' has an exit to ' + q[1]);
  });
});

rows.concat(layoutRows).forEach(function (s) { console.log(s); });
if (unsupported.length) console.log('not supported: ' + unsupported.join(', '));
var n = rows.length;
console.log(fails ? 'diablo2-drlg: ' + fails + ' FAIL (' + n + ' areas x ' + SEEDS + ' seeds)' :
  'diablo2-drlg: all passed (' + n + ' areas x ' + SEEDS + ' seeds, acts ' + ACTS.join(',') + ')');
process.exit(fails ? 1 : 0);
