/*
 * Dịch bản đồ chữ (tools/maps/*.txt) thành data/maps.js theo dạng MapDump của PokéOne.
 * Định dạng tệp và luật: tools/README-world.md.
 *
 *   node games/pokeone/tools/build_maps.js          ghi data/maps.js, in bảng tóm tắt
 *   node games/pokeone/tools/build_maps.js --check  chỉ kiểm, không ghi
 *
 * Chạy lại ra cùng kết quả (không có ngẫu nhiên ngoài băm theo toạ độ).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAPS_DIR = path.join(__dirname, 'maps');
const OUT = path.join(ROOT, 'data', 'maps.js');

function loadGlobal(file) {
  const P1 = {};
  new Function('window', 'P1', fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'))({ P1 }, P1);
  return P1;
}
const PROPS = loadGlobal('props.js').PROPS;
const SPR = loadGlobal('sprites.js');
const AUDIO = loadGlobal('audio.js');
const GAME = loadGlobal('gamedata.js');
// Khoá túi đồ = BattleID của items.txt, nhưng bản gốc mất chữ "é": Poké Ball ra "pokball". Túi dùng 'pokeball'
// (engine.js BALLS, core.js), nên so sau khi bỏ chữ e ấy.
const itemKey = s => String(s).replace(/pok[eé]?/g, 'pok');
const ITEM_KEYS = new Set(Object.values(GAME.ITEMS).map(i => itemKey(i.battleId)));
const ITEM_IDS = { has: id => ITEM_KEYS.has(itemKey(id)) };

/* ---------- ô atlas nền: (c, r) với r tính từ đáy ảnh, mã hoá c + 64*r ---------- */
const cellId = (c, r) => c + 64 * r;

/*
 * Bộ ô tự nối (autotile) của atlas 1: một khối 4 cột, hàng 55..63 [ĐO TRONG REPO bằng mặt nạ màu cỏ, README-world.md].
 * Vùng vật liệu (cát, đất) nằm trên cỏ; viền cỏ mảnh nằm trong ô của vùng.
 */
function autotileSet(b, center) {
  return {
    center,
    tl: [b + 2, 63], tr: [b + 1, 63], bl: [b, 63], br: [b + 3, 63],
    t: [[b, 62], [b + 1, 62]], bo: [[b, 59], [b + 1, 59]],
    l: [[b, 61], [b, 60]], r: [[b + 1, 61], [b + 1, 60]],
    itl: [b + 2, 60], itr: [b + 3, 60], ibl: [b + 2, 59], ibr: [b + 3, 59],
    vbar: [b, 58], hbar: [b + 1, 58],
  };
}
const TERRAIN = {
  sand: autotileSet(20, [1, 59]),
  dirt: autotileSet(24, [1, 60]),
};

/* ---------- đọc tệp ---------- */
function tokens(s) {
  const out = [];
  const re = /(\w+)="([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ? m[1] + '=' + m[2] : m[3]);
  return out;
}
function kv(list) {
  const o = {};
  for (const t of list) {
    const i = t.indexOf('=');
    if (i < 0) o[t] = true; else o[t.slice(0, i)] = t.slice(i + 1);
  }
  return o;
}

function readBrushes() {
  const brushes = {};
  for (const raw of fs.readFileSync(path.join(MAPS_DIR, 'brushes.txt'), 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [name, ...rest] = tokens(line);
    brushes[name] = kv(rest);
  }
  return brushes;
}

function sections(text) {
  const out = { header: [], blocks: [] };
  let cur = { kind: 'header', arg: '', lines: out.header };
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\[(\w+)(?:\s+(.*))?\]\s*$/.exec(raw);
    if (m) { cur = { kind: m[1], arg: (m[2] || '').trim(), lines: [] }; out.blocks.push(cur); continue; }
    cur.lines.push(raw);
  }
  return out;
}

/* ---------- lỗi gom lại, in hết một lần ---------- */
const errors = [];
const fail = (where, msg) => errors.push(where + ': ' + msg);

/* ---------- một bản đồ ---------- */
function compileMap(file, brushes) {
  const id = path.basename(file, '.txt');
  const where = 'maps/' + id + '.txt';
  const sec = sections(fs.readFileSync(file, 'utf8'));
  const head = {};
  for (const raw of sec.header) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (!m) { fail(where, 'header line not understood: ' + line); continue; }
    head[m[1]] = m[2];
  }
  const block = k => sec.blocks.filter(b => b.kind === k);

  /* bảng chú giải: kí tự -> cọ (cọ chung + khoá thêm) */
  const legend = {};
  for (const b of block('legend')) {
    for (const raw of b.lines) {
      const line = raw.replace(/\s#.*$/, '');
      if (!line.trim()) continue;
      const ch = line[0];
      const [bname, ...rest] = tokens(line.slice(1).trim());
      const base = brushes[bname];
      if (!base) { fail(where, "legend '" + ch + "' uses unknown brush " + bname); continue; }
      legend[ch] = Object.assign({ brush: bname }, base, kv(rest));
    }
  }

  const gridLines = (block('grid')[0] || { lines: [] }).lines.filter(l => l.trim() && !/^\s*#/.test(l));
  const h = gridLines.length, w = Math.max(0, ...gridLines.map(l => l.length));
  if (!h) fail(where, 'empty [grid]');
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? gridLines[y][x] || ' ' : null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y);
    if (!legend[ch]) fail(where, "grid char '" + ch + "' at " + x + ',' + y + ' has no legend entry');
  }

  const N = w * h, idx = (x, y) => y * w + x;
  const tiles = new Array(N).fill(-1), tiles2 = new Array(N).fill(-1);
  const heights = new Array(N).fill(0), colliders = new Array(N).fill(0), walls = new Array(N).fill(-1);
  const water = new Array(N).fill(0), zoneGrid = new Array(N).fill(0);
  const terr = new Array(N).fill('');
  const objects = [], marks = {}, doors = {}, allPos = {};
  const zoneIds = [];

  const hash = (x, y, s) => { let v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); v = (v ^ (v >>> 13)) * 1274126177; return ((v ^ (v >>> 16)) >>> 0); };
  const cellOf = (spec, x, y, key) => {
    if (spec == null || spec === true) return -1;
    if (TERRAIN[spec]) { terr[idx(x, y)] = spec; return -1; }
    const alts = String(spec).split('|').map(s => s.split(',').map(Number));
    for (const a of alts) if (a.length !== 2 || a.some(v => !(v >= 0 && v < 64))) { fail(where, key + '=' + spec + ' is not c,r'); return -1; }
    const pick = alts[alts.length === 1 ? 0 : hash(x, y, 7) % alts.length];
    return cellId(pick[0], pick[1]);
  };

  const COLL = { free: 0, solid: 1, down: 2, left: 3, right: 4, up: 5, counter: 6 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const L = legend[at(x, y)];
    if (!L) continue;
    const i = idx(x, y);
    if (L.checker) {
      const alts = String(L.checker).split('|').map(s => s.split(',').map(Number));
      const a = alts[(x % 2) + 2 * (y % 2)] || alts[0];
      tiles[i] = cellId(a[0], a[1]);
    } else tiles[i] = cellOf(L.ground, x, y, 'ground');
    tiles2[i] = cellOf(L.over, x, y, 'over');
    heights[i] = +(L.h || 0);
    walls[i] = cellOf(L.wall, x, y, 'wall');
    if (L.solid) colliders[i] = COLL.solid;
    if (L.counter) colliders[i] = COLL.counter;
    if (L.ledge) {
      if (!COLL[L.ledge] || L.ledge === 'solid' || L.ledge === 'free') fail(where, 'ledge=' + L.ledge);
      colliders[i] = COLL[L.ledge];
    }
    if (L.water) water[i] = 1;
    if (L.grass) {
      let z = zoneIds.indexOf(L.grass);
      if (z < 0) { zoneIds.push(L.grass); z = zoneIds.length - 1; }
      zoneGrid[i] = z + 1;
    }
    if (L.mark) (marks[at(x, y)] = marks[at(x, y)] || []).push([x, y]);
    (allPos[at(x, y)] = allPos[at(x, y)] || []).push([x, y]);
  }

  /* ô tự nối */
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = terr[idx(x, y)];
    if (!t) continue;
    const S = TERRAIN[t];
    const same = (dx, dy) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= w || Y >= h || terr[idx(X, Y)] === t; };
    const n = same(0, -1), s = same(0, 1), wv = same(-1, 0), e = same(1, 0);
    let c;
    if ((!n && !s) || (!wv && !e)) c = !n && !s ? S.hbar : S.vbar;
    else if (!n && !wv) c = S.tl; else if (!n && !e) c = S.tr;
    else if (!s && !wv) c = S.bl; else if (!s && !e) c = S.br;
    else if (!n) c = S.t[x % 2]; else if (!s) c = S.bo[x % 2];
    else if (!wv) c = S.l[y % 2]; else if (!e) c = S.r[y % 2];
    else if (!same(-1, -1)) c = S.itl; else if (!same(1, -1)) c = S.itr;
    else if (!same(-1, 1)) c = S.ibl; else if (!same(1, 1)) c = S.ibr;
    else c = S.center;
    tiles[idx(x, y)] = cellId(c[0], c[1]);
  }

  /* prop: mỗi vùng liền nhau cùng kí tự là một nhóm; step = lát theo bước, fit = một cái giữa vùng */
  const seen = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y), L = legend[ch];
    if (!L || !L.prop || seen[idx(x, y)]) continue;
    const comp = [], stack = [[x, y]];
    seen[idx(x, y)] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      comp.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = cx + dx, Y = cy + dy;
        if (at(X, Y) === ch && !seen[idx(X, Y)]) { seen[idx(X, Y)] = 1; stack.push([X, Y]); }
      }
    }
    const x0 = Math.min(...comp.map(p => p[0])), x1 = Math.max(...comp.map(p => p[0])) + 1;
    const y0 = Math.min(...comp.map(p => p[1])), y1 = Math.max(...comp.map(p => p[1])) + 1;
    const P = PROPS[L.prop];
    if (!P) { fail(where, "prop '" + L.prop + "' (char '" + ch + "') is not in P1.PROPS"); continue; }
    const ry = +(L.ry || 0);
    const dy = +(L.dy || 0);
    const place = (rx0, ry0, rx1, ry1) => {
      // pivot=px,pz: gốc prefab đặt đúng ở góc ô (x0+px, y0+pz), như MapObjectStruct gốc đặt theo số nguyên.
      if (L.pivot) {
        const [px, pz] = L.pivot.split(',').map(Number);
        objects.push({ x: r3(rx0 + px + +(L.dx || 0)), y: r3(dy + heights[idx(rx0, ry0)]), z: r3(ry0 + pz + +(L.dz || 0)), prefab: L.prop, ry, tag: L.tag || '' });
        return;
      }
      // Không có pivot: căn tâm AABB (đã xoay ry) vào giữa khung ô; align=front dán mặt trước (+z) vào mép nam.
      const rot = rotAabb(P.min, P.max, ry);
      const cx = (rx0 + rx1) / 2 - (rot.min[0] + rot.max[0]) / 2 + +(L.dx || 0);
      let cz = (ry0 + ry1) / 2 - (rot.min[2] + rot.max[2]) / 2 + +(L.dz || 0);
      if (L.align === 'front') cz = ry1 - rot.max[2] + +(L.dz || 0);
      if (L.align === 'back') cz = ry0 - rot.min[2] + +(L.dz || 0);
      objects.push({ x: r3(cx), y: r3(dy + heights[idx(rx0, ry0)]), z: r3(cz), prefab: L.prop, ry, tag: L.tag || '' });
    };
    if (L.step) {
      const [sx, sz] = L.step.split('x').map(Number);
      const inComp = new Set(comp.map(p => p[0] + ',' + p[1]));
      for (const [qx, qy] of comp) {
        const ax = qx - (qx - x0) % sx, ay = qy - (qy - y0) % sz;
        if (!inComp.has(ax + ',' + ay)) { fail(where, "'" + ch + "' tile " + qx + ',' + qy + ' is not covered by a ' + L.step + ' ' + L.prop + ' (anchor ' + ax + ',' + ay + ' is not the same char); align the block to the ' + L.step + ' grid from ' + x0 + ',' + y0); break; }
      }
      for (const [px, py] of comp) {
        if ((px - x0) % sx || (py - y0) % sz) continue;
        place(px, py, Math.min(px + sx, x1), Math.min(py + sz, y1));
      }
    } else {
      if (L.size) {
        const [sw, sh] = L.size.split('x').map(Number);
        if (x1 - x0 !== sw || y1 - y0 !== sh || comp.length !== sw * sh) fail(where, "'" + ch + "' region at " + x0 + ',' + y0 + ' is ' + (x1 - x0) + 'x' + (y1 - y0) + ' (' + comp.length + ' tiles), brush wants ' + L.size);
      }
      place(x0, y0, x1, y1);
      if (L.door) {
        const [ddx, ddz] = L.door.split(',').map(Number);
        const dxT = x0 + ddx, dzT = y0 + ddz;
        (doors[ch] = doors[ch] || []).push([dxT, dzT]);
        if (L.doorprop) {
          const D = PROPS[L.doorprop];
          if (!D) fail(where, "doorprop '" + L.doorprop + "' is not in P1.PROPS");
          else objects.push({ x: r3(dxT + 0.5 - (D.min[0] + D.max[0]) / 2 + +(L.doordx || 0)), y: 0, z: r3(dzT + 1 + +(L.doordz || 0)), prefab: L.doorprop, ry: 0, tag: 'door' });
        }
      }
    }
  }

  /* toạ độ tham chiếu: @c = ô đánh dấu duy nhất, hoặc cửa của vùng c; x,y = số */
  // many=true: mọi ô mang dấu đó (thảm cửa 2 ô); còn lại lấy ô đầu tiên theo thứ tự đọc.
  const ref = (s, ctx, many) => {
    if (s[0] === '@') {
      const ch = s.slice(1);
      const list = doors[ch] || marks[ch] || allPos[ch];
      if (!list) { fail(where, ctx + ": '" + s + "' matches no mark or door"); return null; }
      return many ? list : list[0];
    }
    const p = s.split(',').map(Number);
    if (p.length !== 2 || p.some(v => !Number.isFinite(v))) { fail(where, ctx + ": '" + s + "' is not @mark or x,y"); return null; }
    return p;
  };

  /* cửa nối */
  const links = [], linkSpecs = [];
  for (const b of block('links')) for (const raw of b.lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^(door|stairs|edge|warp)\s+(\S+)\s*->\s*(\w+)\s+(\S+)(.*)$/.exec(line);
    if (!m) { fail(where, 'link not understood: ' + line); continue; }
    const edgeOpt = m[1] === 'edge' && m[4].includes('=');
    linkSpecs.push({ kind: m[1], from: m[2], to: m[3], target: edgeOpt ? '' : m[4], opt: kv(tokens((edgeOpt ? m[4] : '') + m[5])), line });
  }

  /* NPC, biển, bóng vật phẩm, huấn luyện viên */
  const npcs = [];
  for (const b of block('actors')) for (const raw of b.lines) {
    const line = raw.replace(/\s#.*$/, '').trim();
    if (!line || line[0] === '#') continue;
    const [aid, pos, ...rest] = tokens(line);
    const o = kv(rest);
    const p = ref(pos, 'actor ' + aid);
    if (!p) continue;
    const kind = o.kind || 'npc';
    const a = { id: aid, kind, x: p[0], y: p[1], face: o.face || 'down', name: o.name || '' };
    if (o.sprite) {
      const file = SPR.NPC_SPRITES[o.sprite] || o.sprite;
      if (!fs.existsSync(path.join(ROOT, 'art/sprite/npc', file + '.png'))) fail(where, 'actor ' + aid + ': sprite ' + o.sprite + ' has no art/sprite/npc/' + file + '.png');
      a.sprite = file;
    }
    if (o.script) a.script = o.script;
    if (o.look) a.look = o.look;
    if (o.path) a.path = o.path;
    if (o.los) a.los = +o.los;
    if (o.fast) a.fast = true;
    if (o.hideif) a.hideIf = o.hideif;
    if (o.showif) a.showIf = o.showif;
    if (o.text) a.text = o.text;
    if (o.item) { if (!ITEM_IDS.has(o.item)) fail(where, 'actor ' + aid + ': item ' + o.item + ' unknown'); a.item = o.item; a.n = +(o.n || 1); }
    if (o.prop) { if (!PROPS[o.prop]) fail(where, 'actor ' + aid + ': prop ' + o.prop + ' missing'); a.prop = o.prop; }
    if (o.team) {
      a.trainer = {
        team: o.team.split(',').map(t => { const [dex, lv] = t.split(':').map(Number); return { dex, level: lv }; }),
        money: +(o.money || 0), exp: +(o.exp || 0), music: o.music || 'trainer_battle', spotted: o.spotted || '',
        cls: o.cls || '',
      };
      if (a.trainer.spotted && !AUDIO.MUSIC[a.trainer.spotted]) fail(where, 'actor ' + aid + ': spotted music ' + a.trainer.spotted + ' missing');
      if (!AUDIO.MUSIC[a.trainer.music]) fail(where, 'actor ' + aid + ': battle music ' + a.trainer.music + ' missing');
    }
    npcs.push(a);
  }

  /* kịch bản */
  const scripts = {};
  for (const b of block('script')) scripts[b.arg] = compileScript(b.arg, b.lines, where);

  /* vùng gặp Pokémon: bảng lấy từ zones.txt */
  const settings = {
    song: head.song || '', indoors: head.indoors === '1' || head.indoors === 'true', tileset: +(head.tileset || 1),
    encounterRate: head.encounter || 'normal', light: head.light || (head.indoors === '1' ? 'indoor' : 'outdoor'),
    cave: head.cave === '1', canMount: head.mount !== '0', mapName: head.name || id,
    bg: head.bg || '', region: head.region || 'kanto', enter: head.enter || '',
  };
  if (head.spawn) { const p = ref(head.spawn, 'spawn'); if (p) settings.spawn = p; }
  if (settings.song && !AUDIO.MUSIC[settings.song]) fail(where, 'song ' + settings.song + ' is not in P1.MUSIC');

  return {
    id, where, map: {
      id, name: head.name || id, w, h, tiles, tiles2, heights, walls, colliders, water,
      zones: { grid: zoneGrid, ids: zoneIds }, links, npcs, objects, settings,
    }, linkSpecs, ref, scripts, marks, doors,
  };
}

function rotAabb(min, max, deg) {
  const a = deg * Math.PI / 180, c = Math.round(Math.cos(a) * 1e6) / 1e6, s = Math.round(Math.sin(a) * 1e6) / 1e6;
  const xs = [], zs = [];
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) { xs.push(c * x + s * z); zs.push(-s * x + c * z); }
  return { min: [Math.min(...xs), min[1], Math.min(...zs)], max: [Math.max(...xs), max[1], Math.max(...zs)] };
}
const r3 = v => Math.round(v * 1000) / 1000;

/* ---------- kịch bản: một lệnh mỗi dòng, nhãn ':tên' ---------- */
const OPS = {
  say: 'text', choose: 'choice', if: 'cond', ifnot: 'cond', goto: 'label', set: 'flag', clear: 'flag', end: '',
  battle: 'battle', heal: '', shop: 'shop', give: 'give', givemon: 'givemon', money: 'num', exp: 'num',
  quest: 'id', questdone: 'id', face: 'dir', move: 'move', sfx: 'key', music: 'key', wait: 'num', warp: 'warp',
  hide: 'flag', show: 'flag', cry: 'num', showmon: 'num', hidemon: '', emote: 'key', blackout: '', pc: '',
  starter: 'id', rival: '', lastheal: '', turnaway: '',
};
function compileScript(name, lines, where) {
  const ops = [], labels = {};
  for (const raw of lines) {
    const line = raw.replace(/^\s+/, '').replace(/\s+$/, '');
    if (!line || line[0] === '#') continue;
    if (line[0] === ':') { labels[line.slice(1).trim()] = ops.length; continue; }
    const sp = line.indexOf(' ');
    let op = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    let who = '';
    const at = op.indexOf('@');
    if (at > 0) { who = op.slice(at + 1); op = op.slice(0, at); }
    if (!(op in OPS)) { fail(where, 'script ' + name + ': unknown op ' + op); continue; }
    const o = { op };
    if (who) o.who = who.replace(/_/g, ' ');
    const kind = OPS[op];
    if (kind === 'text') o.text = rest;
    else if (kind === 'choice') {
      const parts = rest.split('|').map(s => s.trim());
      o.text = parts.shift();
      o.options = parts.map(p => { const m = /^(.*?)\s*>\s*(\S+)$/.exec(p); return m ? { text: m[1], goto: m[2] } : { text: p, goto: null }; });
    } else if (kind === 'cond') {
      const m = /^(\S+)\s*>\s*(\S+)$/.exec(rest);
      if (!m) fail(where, 'script ' + name + ': ' + op + ' needs "<cond> > <label>"');
      else { o.cond = m[1]; o.goto = m[2]; }
    } else if (kind === 'label') o.goto = rest;
    else if (kind === 'flag' || kind === 'id' || kind === 'key' || kind === 'dir') o.arg = rest;
    else if (kind === 'num') o.n = +rest;
    else if (kind === 'battle') {
      const t = kv(tokens(rest));
      o.name = (t.name || '').replace(/_/g, ' ');
      o.self = !!t.self;
      if (t.team) o.team = t.team.split(',').map(s => { const [dex, lv] = s.split(':').map(Number); return { dex, level: lv }; });
      o.money = +(t.money || 0); o.music = t.music || ''; o.win = t.win || ''; o.lose = t.lose || ''; o.canLose = !!t.canlose;
    } else if (kind === 'shop') {
      o.items = rest.split(/\s+/).filter(Boolean).map(s => { const [id, price] = s.split(':'); if (!ITEM_IDS.has(id)) fail(where, 'script ' + name + ': shop item ' + id + ' unknown'); return { id, price: +price }; });
    } else if (kind === 'give') {
      const [id, n] = rest.split(/\s+/);
      if (!ITEM_IDS.has(id)) fail(where, 'script ' + name + ': give item ' + id + ' unknown');
      o.item = id; o.n = +(n || 1);
    } else if (kind === 'givemon') { const [dex, lv] = rest.split(/\s+/).map(Number); o.dex = dex; o.level = lv || 5; }
    else if (kind === 'move') {
      const t = rest.split(/\s+/);
      if (t[0] === 'player' || t[0] === 'self' || /^[a-z_0-9]+$/.test(t[0]) && !/^(up|down|left|right)$/.test(t[0])) o.who = t.shift();
      o.steps = t.map(s => { const m = /^(up|down|left|right)(\d*)$/.exec(s); if (!m) fail(where, 'script ' + name + ': bad move ' + s); return m ? [m[1], +(m[2] || 1)] : null; }).filter(Boolean);
    } else if (kind === 'warp') { const [map, x, y, face] = rest.split(/\s+/); o.map = map; o.x = +x; o.y = +y; o.face = face || 'down'; }
    if (op === 'face') { const t = rest.split(/\s+/); if (t.length > 1) { o.who = t[0]; o.arg = t[1]; } }
    if ((op === 'sfx') && !AUDIO.SFX[o.arg]) fail(where, 'script ' + name + ': sfx ' + o.arg + ' missing');
    if ((op === 'music') && o.arg !== 'map' && !AUDIO.MUSIC[o.arg]) fail(where, 'script ' + name + ': music ' + o.arg + ' missing');
    ops.push(o);
  }
  for (const o of ops) {
    for (const k of ['goto', 'win', 'lose']) {
      if (o[k] && o[k] !== 'end') {
        if (!(o[k] in labels)) fail(where, 'script ' + name + ': label ' + o[k] + ' missing');
        else o[k] = labels[o[k]];
      } else if (o[k] === 'end') o[k] = -1;
    }
    for (const opt of o.options || []) {
      if (opt.goto && opt.goto !== 'end') { if (!(opt.goto in labels)) fail(where, 'script ' + name + ': label ' + opt.goto + ' missing'); else opt.goto = labels[opt.goto]; }
      else if (opt.goto === 'end') opt.goto = -1;
    }
  }
  return ops;
}

/* ---------- vùng gặp: tools/maps/zones.txt ---------- */
function readZones() {
  const zones = {};
  let cur = null;
  for (const raw of fs.readFileSync(path.join(MAPS_DIR, 'zones.txt'), 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^\[zone\s+(\w+)\]\s*(.*)$/.exec(line);
    if (m) { cur = zones[m[1]] = Object.assign({ morning: [], day: [], evening: [], night: [] }, kv(tokens(m[2]))); continue; }
    const [period, ...ents] = line.split(/\s+/);
    const periods = period === 'all' ? ['morning', 'day', 'evening', 'night'] : period.split(',');
    for (const p of periods) {
      if (!cur || !cur[p]) { fail('maps/zones.txt', 'bad line ' + line); continue; }
      for (const e of ents) {
        const [dex, weight, lv] = e.split(':');
        const [min, max] = (lv || '2-4').split('-').map(Number);
        cur[p].push({ dex: +dex, w: +weight, min, max: max || min });
      }
    }
  }
  return zones;
}

/* ---------- nhiệm vụ: tools/maps/quests.txt ---------- */
function readQuests() {
  const quests = {}, order = [];
  for (const raw of fs.readFileSync(path.join(MAPS_DIR, 'quests.txt'), 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/\s#.*$/, '').trim();
    if (!line || line[0] === '#') continue;
    const [qid, ...rest] = tokens(line);
    const o = kv(rest);
    quests[qid] = { id: qid, name: o.name, goal: o.goal, from: o.from || '', exp: +(o.exp || 0), money: +(o.money || 0),
      items: o.items ? o.items.split(',').map(s => { const [id, n] = s.split(':'); return { id, n: +(n || 1) }; }) : [],
      next: o.next || '', group: o.group || 'Kanto' };
    order.push(qid);
    for (const it of quests[qid].items) if (!ITEM_IDS.has(it.id)) fail('maps/quests.txt', qid + ': item ' + it.id);
  }
  for (const q of Object.values(quests)) if (q.next && !quests[q.next]) fail('maps/quests.txt', q.id + ': next ' + q.next + ' missing');
  return { quests, order };
}

/* ---------- ghép, kiểm liên kết, ghi ---------- */
function main() {
  const brushes = readBrushes();
  const files = fs.readdirSync(MAPS_DIR).filter(f => f.endsWith('.txt') && !['brushes.txt', 'zones.txt', 'quests.txt'].includes(f)).sort();
  const built = files.map(f => compileMap(path.join(MAPS_DIR, f), brushes));
  const byId = Object.fromEntries(built.map(b => [b.id, b]));
  const zones = readZones();
  const { quests, order } = readQuests();
  const scripts = {};

  for (const b of built) {
    const M = b.map;
    for (const [k, s] of Object.entries(b.scripts)) {
      if (scripts[k]) fail(b.where, 'script ' + k + ' defined twice');
      scripts[k] = s;
    }
    const tables = {};
    for (const z of M.zones.ids) { if (!zones[z]) fail(b.where, 'zone ' + z + ' not in zones.txt'); else tables[z] = zones[z]; }
    M.zones.tables = tables;
    for (const L of b.linkSpecs) {
      const T = byId[L.to];
      if (!T) { fail(b.where, 'link target map ' + L.to + ' missing: ' + L.line); continue; }
      const face = L.opt.face || '';
      if (L.kind === 'edge') {
        const side = L.from;
        const off = +(L.opt.offset || 0);
        const tgtSide = { north: 'south', south: 'north', west: 'east', east: 'west' }[side];
        if (!tgtSide) { fail(b.where, 'edge side ' + side); continue; }
        const along = side === 'north' || side === 'south' ? M.w : M.h;
        for (let i = 0; i < along; i++) {
          const x = side === 'west' ? -1 : side === 'east' ? M.w : i;
          const y = side === 'north' ? -1 : side === 'south' ? M.h : i;
          const inner = [Math.min(M.w - 1, Math.max(0, x)), Math.min(M.h - 1, Math.max(0, y))];
          if (M.colliders[inner[1] * M.w + inner[0]] === 1) continue;
          const tx = side === 'north' || side === 'south' ? i + off : tgtSide === 'east' ? T.map.w - 1 : 0;
          const ty = side === 'west' || side === 'east' ? i + off : tgtSide === 'south' ? T.map.h - 1 : 0;
          if (tx < 0 || ty < 0 || tx >= T.map.w || ty >= T.map.h || T.map.colliders[ty * T.map.w + tx] === 1) {
            fail(b.where, 'edge ' + side + ' tile ' + inner.join(',') + ' leads to ' + L.to + ' ' + tx + ',' + ty + ' which is blocked or outside');
            continue;
          }
          M.links.push({ x, y, to: L.to, tx, ty, face: face || { north: 'up', south: 'down', west: 'left', east: 'right' }[side], kind: 'edge' });
        }
        continue;
      }
      const froms = L.from[0] === '@' ? b.ref(L.from, 'link ' + L.line, true) : [b.ref(L.from, 'link ' + L.line)];
      const to = T.ref(L.target, 'link target ' + L.line);
      if (!froms || !froms[0] || !to) continue;
      for (const from of froms) {
      let [fx, fy] = from;
      if (L.opt.at === 'below') fy += 1;
      if (L.opt.at === 'above') fy -= 1;
      let [tx, ty] = to;
      if (L.opt.arrive === 'below') ty += 1;
      if (L.opt.arrive === 'above') ty -= 1;
      if (T.map.colliders[ty * T.map.w + tx] === 1) fail(b.where, 'link ' + L.line + ' arrives on blocked tile ' + tx + ',' + ty + ' of ' + L.to);
      M.links.push({ x: fx, y: fy, to: L.to, tx, ty, face: face || 'down', kind: L.kind, sfx: L.opt.sfx || '' });
      }
    }
    for (const a of M.npcs) {
      if (a.script && !b.scripts[a.script] && !built.some(o => o.scripts[a.script])) fail(b.where, 'actor ' + a.id + ': script ' + a.script + ' missing');
      const c = M.colliders[a.y * M.w + a.x];
      if (a.kind !== 'sign' && c === 1) fail(b.where, 'actor ' + a.id + ' stands on a blocked tile ' + a.x + ',' + a.y);
    }
  }
  for (const b of built) if (b.map.settings.enter && !scripts[b.map.settings.enter]) fail(b.where, 'enter script ' + b.map.settings.enter + ' missing');
  for (const [k, ops] of Object.entries(scripts)) for (const o of ops) {
    if ((o.op === 'quest' || o.op === 'questdone') && !quests[o.arg]) fail('script ' + k, 'quest ' + o.arg + ' missing');
    if (o.op === 'warp' && !byId[o.map]) fail('script ' + k, 'warp map ' + o.map + ' missing');
  }

  if (errors.length) {
    console.error(errors.length + ' error(s):\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  const MAPS = Object.fromEntries(built.map(b => [b.id, b.map]));
  const rows = built.map(b => '  ' + b.id.padEnd(18) + String(b.map.w + 'x' + b.map.h).padEnd(7) + String(b.map.objects.length).padStart(4) + ' prop ' +
    String(b.map.npcs.length).padStart(3) + ' actor ' + String(b.map.links.length).padStart(3) + ' link');
  console.log(rows.join('\n'));
  if (process.argv.includes('--check')) return;
  const body = '// Sinh bởi tools/build_maps.js từ tools/maps/*.txt - không sửa tay. Định dạng: tools/README-world.md.\n' +
    'window.P1 = window.P1 || {};\n' +
    'P1.MAPS = ' + JSON.stringify(MAPS) + ';\n' +
    'P1.SCRIPTS = ' + JSON.stringify(scripts) + ';\n' +
    'P1.QUESTS = ' + JSON.stringify(quests) + ';\n' +
    'P1.QUEST_ORDER = ' + JSON.stringify(order) + ';\n' +
    'P1.MAP_NAMES = ' + JSON.stringify(Object.fromEntries(built.map(b => [b.id, b.map.name]))) + ';\n';
  fs.writeFileSync(OUT, body);
  console.log('wrote ' + path.relative(process.cwd(), OUT) + ' (' + (body.length / 1024).toFixed(0) + ' KB)');
}

main();
