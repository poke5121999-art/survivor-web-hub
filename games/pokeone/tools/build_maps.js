/*
 * Dịch bản đồ chữ (tools/maps/*.txt) thành data/maps.js: bản đồ tile 2D ô 32 px vẽ bằng tấm tile PRO.
 * Định dạng tệp, cú pháp cọ và luật: tools/README-world.md.
 *
 *   node games/pokeone/tools/build_maps.js          ghi data/maps.js, in bảng tóm tắt
 *   node games/pokeone/tools/build_maps.js --check  chỉ kiểm, không ghi
 *
 * Sau khi ghi, chạy python tools/pro/rip_tiles.py để chép đúng các tấm tile/sprite NPC mà bản đồ dùng.
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
const AUDIO = loadGlobal('audio.js');
const GAME = loadGlobal('gamedata.js');
// Khoá túi đồ = BattleID của items.txt, nhưng bản gốc mất chữ "é": Poké Ball ra "pokball". Túi dùng 'pokeball'
// (engine.js BALLS, core.js), nên so sau khi bỏ chữ e ấy.
const itemKey = s => String(s).replace(/pok[eé]?/g, 'pok');
const ITEM_KEYS = new Set(Object.values(GAME.ITEMS).map(i => itemKey(i.battleId)));
const ITEM_IDS = { has: id => ITEM_KEYS.has(itemKey(id)) };

/* ---------- ô tile PRO: tấm 1..144, 1024² px, lưới 32×32 ô 32 px. Tham chiếu = tấm*1024 + hàng*32 + cột ---------- */
const SHEETS = 144, CELLS = 32;
const ref = (s, c, r) => s * 1024 + r * CELLS + c;

/* "S:c,r" hoặc "S:c,r,WxH" -> { s, c, r, w, h } | null */
function parseCell(spec, withSize) {
  const m = /^(\d+):(\d+),(\d+)(?:,(\d+)x(\d+))?$/.exec(String(spec).trim());
  if (!m) return null;
  const o = { s: +m[1], c: +m[2], r: +m[3], w: m[4] ? +m[4] : 1, h: m[5] ? +m[5] : 1 };
  if (!!m[4] !== !!withSize) return null;
  if (o.s < 1 || o.s > SHEETS || o.c + o.w > CELLS || o.r + o.h > CELLS) return null;
  return o;
}

/*
 * Ô tự nối (autotile) của PRO [ĐO TRONG REPO bằng mặt nạ alpha trên tấm 60, 79, 35; README-world.md]: mỗi vật liệu có
 *   khung 3×3 neo ở `auto=` (góc TL, cạnh T, TR / L, tâm, R / BL, B, BR), viền nền bên ngoài vẽ sẵn, và
 *   góc trong ở `inner=`: một neo khối 2×2 — (0,0) khi ô chéo đông-nam khác vật liệu, (1,0) tây-nam, (0,1) đông-bắc,
 *   (1,1) tây-bắc (lỗ nền nằm ở tâm khối, kiểu tấm 60/79) — hoặc bốn ô 'ĐN|TN|ĐB|TB' khi chúng nằm rời (kiểu tấm 9).
 * Khung có viền trong suốt (tấm 9) thì cọ có ground= để nền lộ ra: ô tự nối chồng lên lớp nền thay vì thay nó.
 * Vật liệu cùng khoá auto= nối với nhau; mép bản đồ tính là cùng vật liệu (đường chạy ra khỏi map).
 */
function autoCell(f, g, n, s, w, e, nw, ne, sw, se) {
  const F = (dx, dy) => [f.c + dx, f.r + dy];
  if (!n && !w) return F(0, 0); if (!n && !e) return F(2, 0);
  if (!s && !w) return F(0, 2); if (!s && !e) return F(2, 2);
  if (!n) return F(1, 0); if (!s) return F(1, 2);
  if (!w) return F(0, 1); if (!e) return F(2, 1);
  if (g) {
    if (!se) return g[0]; if (!sw) return g[1];
    if (!ne) return g[2]; if (!nw) return g[3];
  }
  return F(1, 1);
}

/* inner=: 'S:c,r' (khối 2×2) hoặc 'S:c,r|S:c,r|S:c,r|S:c,r' -> [[c,r] ĐN, TN, ĐB, TB] | null (cùng tấm với khung) */
function innerCells(spec) {
  const parts = String(spec).split('|').map(p => parseCell(p, false));
  if (parts.some(p => !p)) return null;
  if (parts.length === 1) { const g = parts[0]; return [[g.c, g.r], [g.c + 1, g.r], [g.c, g.r + 1], [g.c + 1, g.r + 1]]; }
  return parts.length === 4 ? parts.map(p => [p.c, p.r]) : null;
}

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

/* Cọ: 'base=<cọ khác>' kế thừa khoá của cọ đó (khoá của mình đè lên). */
function readBrushes() {
  const raw = {};
  for (const line0 of fs.readFileSync(path.join(MAPS_DIR, 'brushes.txt'), 'utf8').split(/\r?\n/)) {
    const line = line0.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [name, ...rest] = tokens(line);
    if (raw[name]) fail('maps/brushes.txt', 'brush ' + name + ' defined twice');
    raw[name] = kv(rest);
  }
  const done = {};
  const resolve = (name, seen) => {
    if (done[name]) return done[name];
    const b = raw[name];
    if (!b) return null;
    if (seen.includes(name)) { fail('maps/brushes.txt', 'base loop ' + seen.concat(name).join(' -> ')); return b; }
    let parent = {};
    if (b.base) {
      parent = resolve(b.base, seen.concat(name));
      if (!parent) { fail('maps/brushes.txt', name + ': base ' + b.base + ' is not a brush'); parent = {}; }
    }
    const o = Object.assign({}, parent, b);
    delete o.base;
    // Cọ con có vật thể riêng thì không kế thừa vật thể / chặn của cọ cha (chỉ kế thừa nền).
    if (b.base && (b.stamp || b.fill)) for (const k of ['deco']) if (!(k in b)) delete o[k];
    return (done[name] = o);
  };
  for (const name in raw) resolve(name, []);
  return done;
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
  const layer = () => new Array(N).fill(-1);
  const ground = [layer()], over = [];
  const colliders = new Array(N).fill(0), water = new Array(N).fill(0), zoneGrid = new Array(N).fill(0);
  const terr = new Array(N).fill(''), autoInner = {};
  const marks = {}, doors = {}, allPos = {};
  const zoneIds = [];
  const sheets = new Set();

  const hash = (x, y, s) => { let v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); v = (v ^ (v >>> 13)) * 1274126177; return ((v ^ (v >>> 16)) >>> 0); };
  const tileOf = (s, c, r) => { sheets.add(s); return ref(s, c, r); };
  /* Lớp chồng: ô đã có tile ở lớp k thì đẩy lên lớp k+1 (thứ tự đặt = thứ tự vẽ trong từng ô). */
  const put = (stack, from, x, y, t) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = idx(x, y);
    let k = from;
    while (k < stack.length && stack[k][i] >= 0) k++;
    if (k === stack.length) stack.push(layer());
    stack[k][i] = t;
  };
  /* 'S:c,r|S:c,r|-' chọn theo băm toạ độ; '-' = để trống (rắc thưa). */
  const pickCell = (spec, x, y, key, salt) => {
    const alts = String(spec).split('|');
    const a = alts[alts.length === 1 ? 0 : hash(x, y, salt) % alts.length].trim();
    if (a === '-') return -1;
    const c = parseCell(a, false);
    if (!c) { fail(where, key + '=' + spec + ": '" + a + "' is not S:c,r"); return -1; }
    return tileOf(c.s, c.c, c.r);
  };

  const COLL = { free: 0, solid: 1, down: 2, left: 3, right: 4, up: 5, counter: 6 };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const L = legend[at(x, y)];
    if (!L) continue;
    const i = idx(x, y);
    if (L.ground) ground[0][i] = pickCell(L.ground, x, y, 'ground', 7);
    if (L.auto) {
      if (!parseCell(L.auto, false) || (L.inner && !innerCells(L.inner))) fail(where, 'auto=' + L.auto + ' inner=' + L.inner + ' is not S:c,r or 4 × S:c,r');
      else { terr[i] = L.auto; autoInner[L.auto] = L.inner || ''; }
    }
    if (L.deco) { const t = pickCell(L.deco, x, y, 'deco', 11); if (t >= 0) put(ground, 1, x, y, t); }
    if (L.over) { const t = pickCell(L.over, x, y, 'over', 13); if (t >= 0) put(over, 0, x, y, t); }
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

  /* ô tự nối: ghi vào lớp nền (khung đã vẽ sẵn nền bên ngoài) */
  const thin = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = terr[idx(x, y)];
    if (!t) continue;
    const same = (dx, dy) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= w || Y >= h || terr[idx(X, Y)] === t; };
    const n = same(0, -1), s = same(0, 1), wv = same(-1, 0), e = same(1, 0);
    if ((!n && !s) || (!wv && !e)) thin.push(x + ',' + y);
    const f = parseCell(t, false), g = autoInner[t] ? innerCells(autoInner[t]) : null;
    const [c, r] = autoCell(f, g, n, s, wv, e, same(-1, -1), same(1, -1), same(-1, 1), same(1, 1));
    const tt = tileOf(f.s, c, r);
    if (ground[0][idx(x, y)] >= 0) put(ground, 1, x, y, tt); else ground[0][idx(x, y)] = tt;
  }
  if (thin.length) fail(where, 'autotile is 1 cell wide (no art for that) at ' + thin.slice(0, 6).join(' ') + (thin.length > 6 ? ' …' : ''));

  /* vùng: mỗi vùng liền nhau (4 hướng) cùng kí tự là một nhóm */
  const seen = new Uint8Array(N);
  const regions = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y), L = legend[ch];
    if (!L || !(L.stamp || L.fill || L.door) || seen[idx(x, y)]) continue;
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
    regions.push({ ch, L, comp, x0, y0, x1, y1 });
  }

  /* fill=S:c,r,WxH: lát mẫu W×H theo toạ độ trong vùng (tường, sàn hoa văn, rừng dày); ghi lớp nền */
  for (const R of regions) {
    if (!R.L.fill) continue;
    const f = parseCell(R.L.fill, true);
    if (!f) { fail(where, "'" + R.ch + "' fill=" + R.L.fill + ' is not S:c,r,WxH'); continue; }
    for (const [x, y] of R.comp) {
      const t = tileOf(f.s, f.c + (x - R.x0) % f.w, f.r + (y - R.y0) % f.h);
      if (R.L.fill2) put(ground, 1, x, y, t); else ground[0][idx(x, y)] = t;
    }
  }

  /*
   * stamp=S:c,r,WxH: tranh nhiều ô. Vùng kí tự trên lưới = chân (chặn nếu cọ có solid). Ô tranh (ax, ay) đặt ở góc
   * trái trên của chân (at=ax,ay; mặc định canh đáy: ax=0, ay=H - cao chân). Hàng tranh nằm trên chân -> lớp 'over'
   * (vẽ đè nhân vật: mái nhà, ngọn cây); hàng từ chân trở xuống (thân nhà, bóng đổ) -> lớp nền chồng dưới nhân vật.
   * step=WxH: lát chân theo bước (rừng cây), các con tem đặt từ bắc xuống nam để cây phía nam đè cây phía bắc.
   */
  const stamps = [];
  for (const R of regions) {
    const L = R.L;
    if (!L.stamp) continue;
    const S = parseCell(L.stamp, true);
    if (!S) { fail(where, "'" + R.ch + "' stamp=" + L.stamp + ' is not S:c,r,WxH'); continue; }
    let fw = R.x1 - R.x0, fh = R.y1 - R.y0;
    const anchors = [];
    if (L.step) {
      const [sx, sy] = L.step.split('x').map(Number);
      fw = sx; fh = sy;
      const inComp = new Set(R.comp.map(p => p[0] + ',' + p[1]));
      for (const [qx, qy] of R.comp) {
        const ax = qx - (qx - R.x0) % sx, ay = qy - (qy - R.y0) % sy;
        if (!inComp.has(ax + ',' + ay)) { fail(where, "'" + R.ch + "' tile " + qx + ',' + qy + ' is not covered by a ' + L.step + ' stamp (anchor ' + ax + ',' + ay + ' is another char); align the block to the ' + L.step + ' grid from ' + R.x0 + ',' + R.y0); break; }
      }
      for (const [px, py] of R.comp) if (!((px - R.x0) % sx) && !((py - R.y0) % sy)) anchors.push([px, py]);
    } else {
      if (R.comp.length !== fw * fh) fail(where, "'" + R.ch + "' region at " + R.x0 + ',' + R.y0 + ' is not a rectangle (' + R.comp.length + ' tiles in ' + fw + 'x' + fh + ')');
      anchors.push([R.x0, R.y0]);
    }
    const [ax, ay] = L.at ? L.at.split(',').map(Number) : [0, S.h - fh];
    if (!(ay >= 0 && ay < S.h) || !(ax >= 0 && ax < S.w)) fail(where, "'" + R.ch + "' at=" + L.at + ' outside the ' + S.w + 'x' + S.h + ' stamp');
    for (const [px, py] of anchors) stamps.push({ S, ox: px - ax, oy: py - ay, top: py, under: !!L.under });
    if (L.door) {
      const [ddx, ddy] = L.door.split(',').map(Number);
      if (!(ddx >= 0 && ddx < fw && ddy >= 0 && ddy < fh)) fail(where, "'" + R.ch + "' door=" + L.door + ' is outside its ' + fw + 'x' + fh + ' footprint');
      (doors[R.ch] = doors[R.ch] || []).push([R.x0 + ddx, R.y0 + ddy]);
    }
  }
  for (const R of regions) if (R.L.door && !R.L.stamp) {
    const [ddx, ddy] = R.L.door.split(',').map(Number);
    (doors[R.ch] = doors[R.ch] || []).push([R.x0 + ddx, R.y0 + ddy]);
  }
  stamps.sort((a, b) => a.top - b.top || a.ox - b.ox);
  for (const st of stamps) {
    const { S } = st;
    for (let r = 0; r < S.h; r++) for (let c = 0; c < S.w; c++) {
      const x = st.ox + c, y = st.oy + r;
      const t = tileOf(S.s, S.c + c, S.r + r);
      if (y < st.top && !st.under) put(over, 0, x, y, t); else put(ground, 1, x, y, t);
    }
  }

  /* toạ độ tham chiếu: @c = ô đánh dấu, hoặc cửa của vùng c; x,y = số */
  // many=true: mọi ô mang dấu đó (thảm cửa 2 ô); còn lại lấy ô đầu tiên theo thứ tự đọc.
  const refPos = (s, ctx, many) => {
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
    const p = refPos(pos, 'actor ' + aid);
    if (!p) continue;
    const kind = o.kind || 'npc';
    const a = { id: aid, kind, x: p[0], y: p[1], face: o.face || 'down', name: o.name || '' };
    if (o.sprite) {
      if (!/^sprite\d+$/.test(o.sprite)) fail(where, 'actor ' + aid + ': sprite ' + o.sprite + ' is not a PRO npc sheet (spriteN)');
      a.sprite = o.sprite;
    } else if (kind === 'npc') fail(where, 'actor ' + aid + ' has no sprite');
    if (o.script) a.script = o.script;
    if (o.look) a.look = o.look;
    if (o.path) a.path = o.path;
    if (o.los) a.los = +o.los;
    if (o.fast) a.fast = true;
    if (o.hideif) a.hideIf = o.hideif;
    if (o.showif) a.showIf = o.showif;
    if (o.text) a.text = o.text;
    if (o.item) { if (!ITEM_IDS.has(o.item)) fail(where, 'actor ' + aid + ': item ' + o.item + ' unknown'); a.item = o.item; a.n = +(o.n || 1); }
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

  const indoors = head.indoors === '1' || head.indoors === 'true';
  const settings = {
    song: head.song || '', indoors, encounterRate: head.encounter || 'normal', mapName: head.name || id,
    bg: head.bg || (indoors ? 'indoor' : 'land'), region: head.region || 'kanto', enter: head.enter || '',
  };
  if (head.spawn) { const p = refPos(head.spawn, 'spawn'); if (p) settings.spawn = p; }
  if (settings.song && !AUDIO.MUSIC[settings.song]) fail(where, 'song ' + settings.song + ' is not in P1.MUSIC');

  // Lớp chồng rỗng hết thì bỏ; ô lớp nền trống là lỗi (lộ nền đen).
  const holes = [];
  for (let i = 0; i < N; i++) if (ground[0][i] < 0) holes.push((i % w) + ',' + ((i / w) | 0));
  if (holes.length) fail(where, holes.length + ' tile(s) with no ground: ' + holes.slice(0, 6).join(' ') + (holes.length > 6 ? ' …' : ''));

  return {
    id, where, map: {
      id, name: head.name || id, w, h, ground, over, colliders, water,
      zones: { grid: zoneGrid, ids: zoneIds }, links, npcs, settings, sheets: [...sheets].sort((a, b) => a - b),
    }, linkSpecs, ref: refPos, scripts, marks, doors,
  };
}

/* ---------- kịch bản: một lệnh mỗi dòng, nhãn ':tên' ---------- */
const OPS = {
  say: 'text', choose: 'choice', if: 'cond', ifnot: 'cond', goto: 'label', set: 'flag', clear: 'flag', end: '',
  battle: 'battle', heal: '', shop: 'shop', give: 'give', givemon: 'givemon', money: 'num', exp: 'num',
  quest: 'id', questdone: 'id', face: 'dir', move: 'move', sfx: 'key', music: 'key', wait: 'num', warp: 'warp',
  hide: 'flag', show: 'flag', cry: 'num', showmon: 'num', hidemon: '', emote: 'key', blackout: '', pc: '',
  starter: 'id', rival: '', lastheal: '', turnaway: '', raid: 'id',
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
  const rows = built.map(b => '  ' + b.id.padEnd(18) + String(b.map.w + 'x' + b.map.h).padEnd(7) + String(b.map.ground.length).padStart(2) + '+' +
    b.map.over.length + ' lớp  tấm ' + b.map.sheets.join(',').padEnd(14) + String(b.map.npcs.length).padStart(3) + ' actor ' + String(b.map.links.length).padStart(3) + ' link');
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
