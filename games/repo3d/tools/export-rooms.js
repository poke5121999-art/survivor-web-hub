#!/usr/bin/env node
// Export the Unity room prefabs of D:/REPO_Topdown to data/rooms.js (data only, no art).
// No dependencies beyond node built-ins. Parses Unity text YAML directly, resolves nested PrefabInstances
// (props, loot/foe points, delivery pads) and mirrors RoomTemplate.ToRoomDef
// (D:/REPO_Topdown/Assets/Scripts/Port/World/RoomTemplate.cs:84-330) for the tile grid.
//
//   node tools/export-rooms.js [--repo D:/REPO_Topdown] [--cfg D:/REPO_Meta/gamespark-config] [--out data/rooms.js]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const REPO = arg('repo', 'D:/REPO_Topdown');
const CFG = arg('cfg', 'D:/REPO_Meta/gamespark-config');
const OUT = arg('out', path.join(__dirname, '..', 'data', 'rooms.js'));
const ASSETS = path.join(REPO, 'Assets');
const ROOMS_DIR = path.join(ASSETS, 'Resources', 'World', 'Rooms');
const THEMES = ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum'];
const O = 24; // px per tile in the Unity prefabs

// ------------------------------------------------------------------ minimal Unity YAML
function unquote(s) {
  s = s.trim();
  if (s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (m, c) => {
      if (c[0] === 'x' || c[0] === 'u' || c[0] === 'U') return String.fromCodePoint(parseInt(c.slice(1), 16));
      return c === 'n' ? '\n' : c === 't' ? '\t' : c;
    });
  }
  if (s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
}
function splitTop(s) { // split on top-level commas
  const out = []; let d = 0, q = false, cur = '';
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && (ch === '{' || ch === '[')) d++;
    if (!q && (ch === '}' || ch === ']')) d--;
    if (!q && d === 0 && ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}
function colonAt(s) { // first ':' that ends a key
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') q = !q;
    if (!q && ch === ':' && (i === s.length - 1 || s[i + 1] === ' ')) return i;
  }
  return -1;
}
function parseFlow(s) {
  s = s.trim();
  if (s[0] === '{') {
    const o = {};
    for (const part of splitTop(s.slice(1, -1))) {
      const c = colonAt(part.trim());
      if (c < 0) continue;
      const t = part.trim();
      o[unquote(t.slice(0, c))] = parseFlow(t.slice(c + 1));
    }
    return o;
  }
  if (s[0] === '[') return splitTop(s.slice(1, -1)).map(parseFlow);
  return unquote(s);
}
function parseYaml(text) {
  const lines = [];
  for (const raw of text.split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (l.trim() === '' || l.trim()[0] === '#') continue;
    const ind = l.length - l.trimStart().length;
    lines.push({ ind, t: l.trim() });
  }
  function block(i, ind) {
    if (i >= lines.length) return [null, i];
    if (lines[i].t === '-' || lines[i].t.startsWith('- ')) return list(i, ind);
    return map(i, ind);
  }
  function list(i, ind) {
    const arr = [];
    while (i < lines.length && lines[i].ind === ind && (lines[i].t === '-' || lines[i].t.startsWith('- '))) {
      const rest = lines[i].t === '-' ? '' : lines[i].t.slice(2);
      if (rest === '') {
        i++;
        if (i < lines.length && lines[i].ind > ind) { const r = block(i, lines[i].ind); arr.push(r[0]); i = r[1]; } else arr.push(null);
      } else if (rest[0] === '{' || rest[0] === '[' || colonAt(rest) < 0) { arr.push(parseFlow(rest)); i++; }
      else { lines[i] = { ind: ind + 2, t: rest }; const r = block(i, ind + 2); arr.push(r[0]); i = r[1]; }
    }
    return [arr, i];
  }
  function map(i, ind) {
    const o = {};
    while (i < lines.length && lines[i].ind === ind && !(lines[i].t === '-' || lines[i].t.startsWith('- '))) {
      const t = lines[i].t, c = colonAt(t);
      if (c < 0) { i++; continue; }
      const key = unquote(t.slice(0, c)), rest = t.slice(c + 1).trim();
      i++;
      if (rest === '') {
        if (i < lines.length && lines[i].ind > ind) { const r = block(i, lines[i].ind); o[key] = r[0]; i = r[1]; }
        else if (i < lines.length && lines[i].ind === ind && (lines[i].t === '-' || lines[i].t.startsWith('- '))) { const r = list(i, ind); o[key] = r[0]; i = r[1]; }
        else o[key] = '';
      } else {
        let v = rest[0] === '{' || rest[0] === '[' ? parseFlow(rest) : unquote(rest);
        while (typeof v === 'string' && i < lines.length && lines[i].ind > ind && rest[0] !== '{') { v += ' ' + lines[i].t; i++; } // wrapped scalar
        o[key] = v;
      }
    }
    return [o, i];
  }
  return block(0, lines.length ? lines[0].ind : 0)[0];
}

// ------------------------------------------------------------------ asset database (guid -> path)
const guidPath = new Map();
let wholeAssetsScanned = false;
function readGuid(metaPath) {
  const t = fs.readFileSync(metaPath, 'utf8');
  const m = /guid:\s*([0-9a-f]{32})/.exec(t);
  return m ? m[1] : null;
}
function walk(dir, fn) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, fn); else fn(p); }
}
function scan(dir, suffix) {
  walk(dir, (p) => { if (p.endsWith(suffix + '.meta')) { const g = readGuid(p); if (g) guidPath.set(g, p.slice(0, -5)); } });
}
function pathOfGuid(g) {
  if (!guidPath.size) { scan(path.join(ASSETS, 'Resources'), '.prefab'); }
  if (!guidPath.has(g) && !wholeAssetsScanned) { wholeAssetsScanned = true; scan(ASSETS, '.prefab'); }
  return guidPath.get(g);
}
const scriptClass = new Map(); // guid -> class name
walk(path.join(ASSETS, 'Scripts'), (p) => {
  if (!p.endsWith('.cs.meta')) return;
  const g = readGuid(p); if (g) scriptClass.set(g, path.basename(p, '.cs.meta'));
});

// ------------------------------------------------------------------ prefab documents
const docCache = new Map();
function loadDocs(file) {
  if (docCache.has(file)) return docCache.get(file);
  const text = fs.readFileSync(file, 'utf8');
  const docs = new Map();
  const parts = text.split(/^--- !u!(\d+) &(\d+)( stripped)?\r?$/m);
  for (let i = 1; i < parts.length; i += 4) {
    const doc = { cls: parts[i], id: parts[i + 1], stripped: !!parts[i + 2], raw: parts[i + 3], _body: undefined };
    Object.defineProperty(doc, 'body', { get() {
      if (this._body === undefined) { const y = parseYaml(this.raw); this._body = y ? y[Object.keys(y)[0]] || {} : {}; }
      return this._body;
    } });
    docs.set(doc.id, doc);
  }
  docCache.set(file, docs);
  return docs;
}
const CLS = { GO: '1', TF: '4', MONO: '114', PI: '1001', TILEMAP: '1839735485', GRID: '156049354' };
const fid = (r) => (r && typeof r === 'object' ? String(r.fileID) : '0');
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

// 2D affine [a b c d e f]: x' = a x + c y + e ; y' = b x + d y + f
const ID = [1, 0, 0, 1, 0, 0];
const mul = (p, l) => [p[0] * l[0] + p[2] * l[1], p[1] * l[0] + p[3] * l[1], p[0] * l[2] + p[2] * l[3], p[1] * l[2] + p[3] * l[3], p[0] * l[4] + p[2] * l[5] + p[4], p[1] * l[4] + p[3] * l[5] + p[5]];
const inv = (m) => { const det = m[0] * m[3] - m[1] * m[2]; const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det; return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]; };
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const stats = { unknownScripts: new Map(), addedObjects: 0, nonIdentityRot: 0 };

// Flatten one prefab file into nodes. ov: Map "targetFileID|propertyPath" -> value. parent: {node, mat, active}
function expandFile(file, ov, parent, out, registry, depth = 0) {
  if (depth > 8) throw new Error('prefab nesting too deep at ' + file);
  const docs = loadDocs(file);
  const tf = new Map(); // transform id -> {go, father, local}
  const goOf = new Map(); // go id -> go doc
  for (const d of docs.values()) {
    if (d.stripped) continue;
    if (d.cls === CLS.GO) goOf.set(d.id, d);
  }
  const removedGO = new Set();
  for (const d of docs.values()) {
    if (d.cls !== CLS.TF || d.stripped) continue;
    const b = d.body;
    const g = (p, dflt) => { const k = d.id + '|' + p; return ov.has(k) ? num(ov.get(k), dflt) : null; };
    const lp = b.m_LocalPosition || {}, lr = b.m_LocalRotation || {}, ls = b.m_LocalScale || {};
    const px = g('m_LocalPosition.x') ?? num(lp.x), py = g('m_LocalPosition.y') ?? num(lp.y);
    const sx = g('m_LocalScale.x') ?? num(ls.x, 1), sy = g('m_LocalScale.y') ?? num(ls.y, 1);
    const qz = g('m_LocalRotation.z') ?? num(lr.z), qw = g('m_LocalRotation.w') ?? num(lr.w, 1);
    const qx = g('m_LocalRotation.x') ?? num(lr.x), qy = g('m_LocalRotation.y') ?? num(lr.y);
    if (Math.abs(qx) > 1e-4 || Math.abs(qy) > 1e-4) stats.nonIdentityRot++;
    const ang = 2 * Math.atan2(qz, qw), cs = Math.cos(ang), sn = Math.sin(ang);
    tf.set(d.id, { id: d.id, go: fid(b.m_GameObject), father: fid(b.m_Father), local: [cs * sx, sn * sx, -sn * sy, cs * sy, px, py] });
  }
  const instDocs = [...docs.values()].filter((d) => d.cls === CLS.PI);
  for (const pi of instDocs) for (const r of (pi.body.m_Modification.m_RemovedGameObjects || [])) removedGO.add(fid(r));
  const world = new Map(); // transform id -> {mat, active, node, removed}
  const instState = new Map(); // instance id -> registry map
  function strippedParent(id) {
    const d = docs.get(id); if (!d || !d.stripped) return null;
    const inst = fid(d.body.m_PrefabInstance), src = fid(d.body.m_CorrespondingSourceObject);
    return { inst, src };
  }
  function instRegistry(instId) {
    if (instState.has(instId)) return instState.get(instId);
    const pi = docs.get(instId);
    const reg = new Map(); instState.set(instId, reg);
    const m = pi.body.m_Modification;
    const nov = new Map();
    for (const mod of (m.m_Modifications || [])) nov.set(fid(mod.target) + '|' + mod.propertyPath, mod.value);
    for (const [k, v] of ov) if (!nov.has(k)) nov.set(k, v); // outer overrides fill gaps
    const src = pathOfGuid(pi.body.m_SourcePrefab.guid);
    if (!src) { console.warn('  ! missing source prefab guid', pi.body.m_SourcePrefab.guid, 'in', path.basename(file)); return reg; }
    const tp = fid(m.m_TransformParent);
    let par;
    if (tp === '0') par = parent;
    else par = parentOf(tp);
    for (const a of (m.m_AddedGameObjects || [])) stats.addedObjects++;
    expandFile(src, nov, par, out, reg, depth + 1);
    return reg;
  }
  function parentOf(tid) { // parent context for a transform id (normal or stripped)
    const st = strippedParent(tid);
    if (st) { const reg = instRegistry(st.inst); return reg.get(st.src) || parent; }
    return worldOf(tid);
  }
  function worldOf(tid) {
    if (world.has(tid)) return world.get(tid);
    const t = tf.get(tid);
    if (!t) return parent;
    let par = parent;
    if (t.father !== '0') par = parentOf(t.father);
    const goDoc = goOf.get(t.go);
    const selfActive = ov.has(t.go + '|m_IsActive') ? ov.get(t.go + '|m_IsActive') !== '0' : String(goDoc.body.m_IsActive) !== '0';
    const removed = par.removed || removedGO.has(t.go);
    const w = { mat: mul(par.mat, t.local), active: par.active && selfActive, selfActive, removed, node: null };
    world.set(tid, w);
    const name = ov.has(t.go + '|m_Name') ? ov.get(t.go + '|m_Name') : goDoc.body.m_Name;
    const node = { name: String(name ?? ''), mat: w.mat, selfActive, active: w.active, removed, parent: par.node || null, comps: [], file: path.basename(file) };
    w.node = node;
    for (const c of (goDoc.body.m_Component || [])) {
      const cd = docs.get(fid(c.component)); if (!cd || cd.cls === CLS.TF) continue;
      let cls = null;
      if (cd.cls === CLS.MONO) {
        const sg = cd.body.m_Script && cd.body.m_Script.guid;
        cls = scriptClass.get(sg);
        if (!cls) { const k = String(sg); stats.unknownScripts.set(k, (stats.unknownScripts.get(k) || 0) + 1); continue; }
      } else if (cd.cls === CLS.TILEMAP) cls = 'Tilemap';
      else if (cd.cls === CLS.GRID) cls = 'Grid';
      else continue;
      const body = cd.body, cid = cd.id;
      node.comps.push({ cls, id: cid, body, get(p) { const k = cid + '|' + p; if (ov.has(k)) return ov.get(k); const parts = p.split('.'); let v = body; for (const q of parts) v = v == null ? v : v[q]; return v; } });
    }
    out.push(node);
    registry.set(tid, w);
    return w;
  }
  for (const tid of tf.keys()) worldOf(tid);
  for (const pi of instDocs) instRegistry(pi.id);
  return registry;
}

// ------------------------------------------------------------------ room conversion
const KIND = ['shared', 'corridor', 'deadend', 'private', 'extract', 'special', 'truck', 'shop', 'ride'];
const SIDE_NAME = ['left', 'right', 'top', 'bottom'];
const TRAP = ['spike', 'poison', 'mud', 'fire', 'gas', 'ice', 'smoke', 'laser'];
const LIGHT_RE = /lamp|light|torch|candle|chandelier|lantern|sconce|brazier|fire|flame/i;

function convertRoom(file) {
  const out = [];
  const reg = new Map();
  expandFile(file, new Map(), { node: null, mat: ID, active: true, selfActive: true, removed: false }, out, reg);
  const nodes = out.filter((n) => !n.removed);
  const rootNode = nodes.find((n) => n.comps.some((c) => c.cls === 'RoomTemplate'));
  if (!rootNode) return null;
  const rt = rootNode.comps.find((c) => c.cls === 'RoomTemplate');
  const R = inv(rootNode.mat);
  const num_ = (n, d) => num(rt.get(n), d);
  const cellsWide = Math.max(1, num_('cellsWide', 1)), cellsTall = Math.max(1, num_('cellsTall', 1));
  const W = num_('widthTiles', 0) > 0 ? num_('widthTiles', 0) : 21 * cellsWide;
  const H = num_('heightTiles', 0) > 0 ? num_('heightTiles', 0) : 15 * cellsTall;
  const local = (n) => apply(mul(R, n.mat), 0, 0); // unity-up room coords of the node origin
  const pos = (n) => { const p = local(n); return { x: p[0], y: -p[1] }; }; // px, y down
  const g = []; for (let y = 0; y < H; y++) g.push(new Array(W).fill('.'));
  let outside = 0;
  // 1) RoomCell characters (every RoomCell, active or not, as in GetComponentsInChildren(true))
  const propLetters = [];
  for (const n of nodes) for (const c of n.comps) if (c.cls === 'RoomCell') {
    const ch = unquote(String(c.get('character') ?? ''));
    if (!ch) continue;
    const p = pos(n), x = Math.floor(p.x / O), y = Math.floor(p.y / O);
    if (x < 0 || y < 0 || x >= W || y >= H) { outside++; continue; }
    g[y][x] = ch[0];
  }
  // 2) Tilemaps San / Wall
  const findMap = (name) => nodes.find((n) => n.name === name && n.active && n.comps.some((c) => c.cls === 'Tilemap'));
  const tmSanN = findMap('San'), tmWallN = findMap('Wall');
  const gridOf = (n) => { for (let q = n; q; q = q.parent) { const gc = q.comps.find((c) => c.cls === 'Grid'); if (gc) { const cs = gc.get('m_CellSize') || {}; return [num(cs.x, O) || O, num(cs.y, O) || O]; } } return [O, O]; };
  function tileSet(n) {
    const c = n.comps.find((x) => x.cls === 'Tilemap'), b = c.body;
    const assets = (b.m_TileAssetArray || []).map((a) => fid(a.m_Data) !== '0');
    const sprites = (b.m_TileSpriteArray || []).map((a) => fid(a.m_Data) !== '0');
    const map = new Map();
    for (const t of (b.m_Tiles || [])) {
      const s = t.second, ti = num(s.m_TileIndex), si = num(s.m_TileSpriteIndex);
      map.set(num(t.first.x) + ',' + num(t.first.y), { tile: !!assets[ti], sprite: !!sprites[si] });
    }
    const cs = gridOf(n), M = inv(mul(R, n.mat));
    return { map, cs, M, raw: c };
  }
  const cellAt = (ts, x, y) => { const p = apply(ts.M, (x + 0.5) * O, -(y + 0.5) * O); return ts.map.get(Math.floor(p[0] / ts.cs[0]) + ',' + Math.floor(p[1] / ts.cs[1])); };
  const san = tmSanN ? tileSet(tmSanN) : null, wall = tmWallN ? tileSet(tmWallN) : null;
  const wallSprite = new Uint8Array(W * H);
  if (san || wall) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fl = san ? cellAt(san, x, y) : null;
      if (wall) {
        const t = cellAt(wall, x, y);
        if (t && t.tile) { g[y][x] = '#'; if (t.sprite) wallSprite[y * W + x] = 1; continue; }
      }
      // no floor sprite and no wall tile = unpainted wall core: blocks, drawn as nothing (' ' here)
      if (san && !(fl && fl.sprite)) g[y][x] = ' ';
    }
  }
  // 3) fixed props
  const props = [], lights = [];
  const tableLoot = new Set();
  for (const n of nodes) {
    const piece = n.comps.find((c) => c.cls === 'PropPiece'), proc = piece ? null : n.comps.find((c) => c.cls === 'PropProc');
    if (!piece && !proc) continue;
    if (!n.active) continue;
    const comp = piece || proc;
    const fw0 = Math.max(1, num(comp.get('footW'), 1)), fhDay = Math.max(1, num(comp.get('footH'), 1));
    const br = piece ? num(piece.get('blockingRows'), 0) : 0;
    const fh0 = piece ? (br > 0 ? Math.min(br, fhDay) : fhDay) : fhDay; // RealBlockingRows
    const hop = piece ? { x: num(piece.get('hopSize.x')), y: num(piece.get('hopSize.y')), ox: num(piece.get('hopOffset.x')), oy: num(piece.get('hopOffset.y')) } : null;
    const hasBox = !!(hop && hop.x > 0 && hop.y > 0);
    // DrawOrder.BlocksPath / BandFor (DrawOrder.cs:57-129)
    let below;
    const layer = num(comp.get('layer'), 0);
    if (piece) {
      const role = String(piece.get('role') ?? ''), fam = String(piece.get('family') ?? '');
      if (layer === 1) below = true; else if (layer === 2 || layer === 3) below = false;
      else if (role !== '') below = role === 'tham' || role === 'treo';
      else if (['tham', 'vo_gom', 'nat', 'treo_nho', 'treo_to', 'cua_so'].includes(fam)) below = true;
      else below = false;
    } else {
      if (layer === 1) below = true; else if (layer === 2 || layer === 3) below = false;
      else below = num(proc.get('kind'), 5) === 7;
    }
    const blocksFlag = String(comp.get('blocksPath') ?? '1') !== '0';
    let foot;
    if (piece) { const f = num(piece.get('foot'), 0); foot = f === 1 ? true : f === 2 ? false : blocksFlag && !below; } else foot = blocksFlag && !below;
    const p = pos(n);
    const nm = n.name;
    if (LIGHT_RE.test(nm)) lights.push({ x: +(p.x / O).toFixed(2), y: +(p.y / O).toFixed(2), name: nm });
    if (!foot) {
      let ax = piece && num(piece.get('neoX'), -1) >= 0 ? num(piece.get('neoX')) : Math.floor(p.x / O);
      let ay = piece && num(piece.get('anchorY'), -1) >= 0 ? num(piece.get('anchorY')) : Math.round(p.y / O) - 1;
      ax = Math.min(Math.max(ax, 0), W - 1); ay = Math.min(Math.max(ay, 0), H - 1);
      props.push({ x: ax, y: ay, w: 1, h: 1, name: nm, blocks: false });
      continue;
    }
    // BlockingCells (RoomTemplate.cs:416)
    let cx0, cy0, cw, ch;
    if (hasBox) {
      const rx0 = p.x + (hop.ox - hop.x / 2), rx1 = p.x + (hop.ox + hop.x / 2);
      // y is down: box y range (up) is [oy - h/2, oy + h/2] about the origin
      const ry0 = p.y - (hop.oy + hop.y / 2), ry1 = p.y - (hop.oy - hop.y / 2);
      cx0 = Math.floor(rx0 / O + 1e-3); cy0 = Math.floor(ry0 / O + 1e-3);
      cw = Math.max(cx0 + 1, Math.ceil(rx1 / O - 1e-3)) - cx0; ch = Math.max(cy0 + 1, Math.ceil(ry1 / O - 1e-3)) - cy0;
    } else {
      cx0 = Math.round(p.x / O - fw0 / 2); const yb = Math.round(p.y / O) - 1; cw = fw0; ch = fh0; cy0 = yb - fh0 + 1;
    }
    if (!(cx0 >= 0 && cy0 >= 0 && cx0 + cw <= W && cy0 + ch <= H)) outside++;
    let x0, yb, fw = fw0, fh = fh0;
    if (hasBox) {
      const hx0 = Math.min(Math.max(cx0, 0), W - 1), hy0 = Math.min(Math.max(cy0, 0), H - 1);
      const hx1 = Math.min(Math.max(cx0 + cw, hx0 + 1), W), hy1 = Math.min(Math.max(cy0 + ch, hy0 + 1), H);
      x0 = hx0; fw = hx1 - hx0; yb = hy1 - 1; fh = hy1 - hy0;
    } else {
      x0 = Math.min(Math.max(cx0, 0), W - fw); yb = Math.min(Math.max(cy0 + ch - 1, fh - 1), H - 1);
    }
    const y0 = yb - fh + 1;
    const tabletop = !!piece && String(piece.get('tabletop') ?? '0') !== '0';
    for (let y = y0; y <= yb; y++) for (let x = x0; x < x0 + fw; x++) {
      if (y < 0 || x < 0 || y >= H || x >= W) continue;
      if (wall && wallSprite[y * W + x]) continue;
      if (tabletop && g[y][x] === 'L') tableLoot.add(y * W + x);
      g[y][x] = 'F';
    }
    props.push({ x: x0, y: y0, w: fw, h: fh, name: nm, blocks: true });
  }
  // RoomCell prop letters (T S C P x K R U) are code-drawn blockers: list them as props, rows get 'F'
  const letters = 'TSCPxKRU';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (letters.includes(g[y][x])) { props.push({ x, y, w: 1, h: 1, name: 'proc:' + g[y][x], blocks: true }); g[y][x] = 'F'; }
  // 4) doors (RoomDoor.Read, RoomDoor.cs:23-34)
  let doors = null;
  for (const n of nodes) {
    if (!n.active || !n.comps.some((c) => c.cls === 'RoomDoor')) continue;
    const p = pos(n), fx = p.x / O, fy = p.y / O;
    const dL = fx, dR = W - fx, dT = fy, dB = H - fy, m = Math.min(dL, dR, dT, dB);
    let side, v;
    if (m === dL || m === dR) { side = m === dL ? 0 : 1; v = Math.min(Math.max(Math.floor(fy), 1), H - 2); }
    else { side = m === dT ? 2 : 3; v = Math.min(Math.max(Math.floor(fx), 1), W - 2); }
    (doors || (doors = [])).push({ side, pos: v });
  }
  if (doors === null && (san || wall)) doors = []; // painted rooms always declare doors by hand
  // 5) pads, traps, truck markers
  const pads = [], traps = [];
  let truck = null, cart = null, parking = [], ram = null;
  for (const n of nodes) {
    const p = pos(n);
    for (const c of n.comps) {
      if (c.cls === 'DeliveryPad' && n.active) {
        const nut = nodes.find((q) => q.parent === n && q.name === 'Nut' && q.selfActive);
        const e = { x: Math.floor(p.x / O), y: Math.floor(p.y / O), fx: +(p.x / O).toFixed(3), fy: +(p.y / O).toFixed(3) };
        if (nut) { const q = pos(nut); e.nut = { fx: +(q.x / O).toFixed(3), fy: +(q.y / O).toFixed(3) }; }
        pads.push(e);
      } else if (c.cls === 'TrapPoint' && n.selfActive) {
        traps.push({ x: Math.floor(p.x / O), y: Math.floor(p.y / O), kind: TRAP[num(c.get('kind'), 0)] || 'spike', dir: Math.min(Math.max(num(c.get('direction'), 0), 0), 3), len: Math.max(1, num(c.get('length'), 4)) });
      } else if (c.cls === 'TruckPoint' && n.active) {
        const k = num(c.get('kind'), 2), fp = { fx: +(p.x / O).toFixed(3), fy: +(p.y / O).toFixed(3) };
        if (k === 3) { if (!ram) { const fx = p.x / O, fy = p.y / O, d = [fx, W - fx, fy, H - fy], m = Math.min(...d); ram = m === d[0] ? 'left' : m === d[1] ? 'right' : m === d[2] ? 'top' : 'bottom'; } }
        else if (k === 0) truck = truck || fp; else if (k === 1) cart = cart || fp; else parking.push(Object.assign({ name: n.name }, fp));
      }
    }
  }
  // 6) rows -> strings; loot / foes read from the final grid
  const loot = [], foes = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] === 'L') loot.push({ x, y, place: 'floor' });
    else if (g[y][x] === 'M') foes.push({ x, y });
  }
  for (const k of tableLoot) loot.push({ x: k % W, y: Math.floor(k / W), place: 'table' });
  loot.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = g.map((r) => r.map((c) => (c === 'L' || c === 'M' ? '.' : c)).join(''));
  // mark door-able edge cells ('d') on wall cells of the 3-wide span around each declared door
  if (doors) for (const d of doors) for (let o = -1; o <= 1; o++) {
    const x = d.side === 0 ? 0 : d.side === 1 ? W - 1 : d.pos + o, y = d.side === 2 ? 0 : d.side === 3 ? H - 1 : d.pos + o;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const r = rows[y]; if (r[x] === '#' || r[x] === ' ') rows[y] = r.slice(0, x) + 'd' + r.slice(x + 1);
  }
  const kind = KIND[num_('kind', 0)] || 'shared';
  const size = ['small', 'medium', 'large', 'short', 'long', 'extralong'][num_('size', 0)] || 'small';
  const maxDoors = num_('maxDoors', -1);
  const room = {
    name: rootNode.name, kind, w: W, h: H, rows,
    size, direction: num_('direction', 0) === 1 ? 'vertical' : 'horizontal',
    maxDoors, allowFlip: String(rt.get('allowFlip') ?? '0') !== '0',
    doors, // null = prefab declares none (generator opens the middle of every edge)
    loot, foes, traps, props, pad: pads[0] || null, lights,
  };
  if (pads.length > 1) room.pads = pads;
  if (kind === 'truck') { room.truck = truck; room.cart = cart; room.parking = parking; room.ram = ram; }
  if (outside) room.outside = outside;
  return room;
}

// ------------------------------------------------------------------ folder sets (RoomLibrary.cs:100-260)
const RANK = { shared: 0, corridor: 1, deadend: 2, private: 3, extract: 4, special: 5, truck: 6 };
function loadFolder(dir) {
  const full = path.join(ROOMS_DIR, dir);
  if (!fs.existsSync(full)) return [];
  const list = [];
  for (const f of fs.readdirSync(full).filter((x) => x.endsWith('.prefab')).sort()) {
    let r;
    try { r = convertRoom(path.join(full, f)); } catch (e) { console.error('FAILED', dir + '/' + f, e.stack); process.exitCode = 1; continue; }
    if (!r) { console.warn('skip (no RoomTemplate):', dir + '/' + f); continue; }
    r.file = dir + '/' + f;
    list.push(r);
  }
  list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)); // string.CompareOrdinal on GameObject name
  list.forEach((r, i) => { r.order = i; });
  return list;
}

const t0 = Date.now();
const sets = {};
for (const dir of ['_extract', '_truck']) sets[dir] = loadFolder(dir);
const ROOMS = {};
const counts = {};
for (const theme of THEMES) {
  const own = loadFolder(theme), ownEx = loadFolder('_extract_' + theme), ownTr = loadFolder('_truck_' + theme);
  const byKind = {};
  for (const r of own) (byKind[r.kind] = byKind[r.kind] || []).push(r);
  const extractOf = (k) => { const o = ownEx.filter((r) => r.kind === k); return o.length ? o : sets._extract.filter((r) => r.kind === k); };
  byKind.extract = extractOf('extract');
  byKind.special = extractOf('special');
  byKind.truck = ownTr.length ? ownTr : sets._truck;
  // order inside each resolved set mirrors the C# list index (used for prefab ids / shuffles)
  for (const k of ['extract', 'special', 'truck']) byKind[k] = byKind[k].map((r, i) => Object.assign({}, r, { order: i, from: r.file.split('/')[0] }));
  for (const k of Object.keys(byKind)) byKind[k].sort((a, b) => a.order - b.order);
  ROOMS[theme] = byKind;
  counts[theme] = Object.fromEntries(Object.keys(RANK).map((k) => [k, (byKind[k] || []).length]));
}

// ------------------------------------------------------------------ house table from gamespark-config
const th = JSON.parse(fs.readFileSync(path.join(CFG, 'stage_theme_houses.json'), 'utf8'));
const sr = JSON.parse(fs.readFileSync(path.join(CFG, 'stage_rules.json'), 'utf8'));
const stageRules = Array.isArray(sr) ? sr[0] : sr;
const HOUSE_SPECS = {};
for (const row of th) {
  const [t, h] = row._id.split('-').map(Number);
  (HOUSE_SPECS[THEMES[t - 1]] = HOUSE_SPECS[THEMES[t - 1]] || {})[h] = {
    extractRooms: row.extractRooms, privateRooms: row.privateRooms, sharedRooms: row.sharedRooms,
    shortCorridors: row.shortCorridors, longCorridors: row.longCorridors, specialExtract: !!row.specialExtract,
    mediumRatio: row.mediumRatio, largeRatio: row.largeRatio,
  };
}
const MIN_PAD_SPACING = Math.max(1, stageRules.minPadSpacing || 1);

// ------------------------------------------------------------------ write
const head = '// GENERATED by tools/export-rooms.js from ' + REPO.replace(/\\/g, '/') + ' (Assets/Resources/World/Rooms). Do not edit by hand.\n' +
  '// Tile coords: x right, y down, 1 tile = 1 m. rows: " " unpainted wall core, "." floor, "#" wall, "F" blocking prop, "d" wall cell of a declared door span.\n';
const body = 'export const ROOMS = ' + JSON.stringify(ROOMS) + ';\n' +
  'export const HOUSE_SPECS = ' + JSON.stringify(HOUSE_SPECS) + ';\n' +
  'export const MIN_PAD_SPACING = ' + MIN_PAD_SPACING + ';\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, head + body);

console.log('rooms per theme/kind (resolved sets: extract/special/truck fall back to _extract/_truck per kind)');
const kinds = Object.keys(RANK);
console.log('theme'.padEnd(14) + kinds.map((k) => k.padStart(9)).join(''));
for (const t of THEMES) console.log(t.padEnd(14) + kinds.map((k) => String(counts[t][k]).padStart(9)).join(''));
let nOut = 0; for (const t of THEMES) for (const k of kinds) for (const r of ROOMS[t][k] || []) if (r.outside) nOut++;
console.log('shared source sets: _extract=' + sets._extract.length + ' _truck=' + sets._truck.length + ' | rooms with outside-frame items: ' + nOut);
if (stats.unknownScripts.size) console.log('unmapped script guids (ignored):', [...stats.unknownScripts].map(([g, n]) => g.slice(0, 8) + 'x' + n).join(' '));
if (stats.addedObjects) console.log('note: m_AddedGameObjects ignored:', stats.addedObjects);
if (stats.nonIdentityRot) console.log('note: transforms with x/y rotation ignored:', stats.nonIdentityRot);
console.log('wrote ' + OUT + ' (' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB) in ' + (Date.now() - t0) + ' ms');
