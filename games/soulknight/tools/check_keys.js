// Soát khoá khung/anim sau khi chạy lại build_sk.py:
//   node games/soulknight/tools/check_keys.js [--base <sk-data.js cũ>] [--out <thư mục build thử>]
// Mặc định so với bản đã commit (git show HEAD:games/soulknight/data/sk-data.js).
// Khoá "được dùng" = chuỗi hằng trong mã chạy (js/, js/season/, data/sk-wiki.js, data/season-*.js,
// tools/extra/*.json) trùng tên khung/anim/prefab của bản cũ, cộng mọi khoá cấu trúc mà mã chạy tra động
// (heroes, extra.*, prefab + tên state, enemies, themes, patterns...). Thiếu một khoá là thoát mã 1.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const GAME = path.resolve(__dirname, '..');
const REPO = path.resolve(GAME, '..', '..');

function loadData(src) {
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx);
  return { A: ctx.window.SK_ATLAS, D: ctx.window.SK_DATA };
}

const argBase = process.argv.indexOf('--base');
const baseSrc = argBase > 0
  ? fs.readFileSync(process.argv[argBase + 1], 'utf8')
  : cp.execFileSync('git', ['show', 'HEAD:games/soulknight/data/sk-data.js'], { cwd: REPO, maxBuffer: 1 << 28 }).toString('utf8');
const OLD = loadData(baseSrc);
// --out DIR: soát bản build thử (build_sk.py --out DIR) thay vì bản trong game
const argOut = process.argv.indexOf('--out');
const OUTDIR = argOut > 0 ? path.resolve(process.argv[argOut + 1]) : GAME;
const NEW = loadData(fs.readFileSync(path.join(OUTDIR, 'data', 'sk-data.js'), 'utf8'));

const files = [];
const addDir = (d, re) => { if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (re.test(f)) files.push(path.join(d, f)); };
addDir(path.join(GAME, 'js'), /\.js$/);
addDir(path.join(GAME, 'js', 'season'), /\.js$/);
addDir(path.join(GAME, 'data'), /^(sk-wiki|season-.*)\.js$/);
addDir(path.join(GAME, 'tools', 'extra'), /\.json$/);

const lits = new Map();   // chuỗi -> tệp đầu tiên thấy
const LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`$\\]*)`/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = LIT.exec(src))) {
    const s = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    if (s && s.length < 200 && !lits.has(s)) lits.set(s, path.relative(GAME, f).replace(/\\/g, '/'));
  }
}

const missing = [], warn = [];
const need = (ok, what) => { if (!ok) missing.push(what); };
let nFrames = 0, nAnims = 0, nPrefabs = 0;

for (const [s, where] of lits) {
  if (OLD.A.f[s]) {
    nFrames++;
    const a = OLD.A.f[s], b = NEW.A.f[s];
    need(b, `frame '${s}' (${where})`);
    if (b && (a[3] !== b[3] || a[4] !== b[4])) warn.push(`frame '${s}' ${a[3]}x${a[4]} -> ${b[3]}x${b[4]}`);
  }
  if (OLD.D.anims[s]) { nAnims++; need(NEW.D.anims[s], `anim '${s}' (${where})`); }
  if (OLD.D.prefabs[s]) { nPrefabs++; need(NEW.D.prefabs[s], `prefab '${s}' (${where})`); }
}

// khoá tra động
for (const [id, h] of Object.entries(OLD.D.heroes)) {
  for (const [sk, e] of Object.entries(h)) {
    const n = NEW.D.heroes[id] && NEW.D.heroes[id][sk];
    need(n, `hero ${id}.${sk}`);
    if (!n) continue;
    for (const k of ['idle', 'run', 'dead']) if (e[k]) need(n[k] === e[k] && NEW.D.anims[n[k]], `hero ${id}.${sk}.${k} = ${e[k]}`);
    need(n.index === e.index, `hero ${id}.${sk}.index ${e.index} -> ${n.index}`);
  }
}
for (const [kind, tbl] of Object.entries(OLD.D.extra || {})) {
  for (const [k, v] of Object.entries(tbl)) {
    // khoá extra chỉ bắt buộc khi tệp tools/extra/*.json hiện tại còn xin (khoá cũ bỏ rồi thì thôi)
    if (kind !== 'clips' && !lits.has(k)) continue;
    const n = NEW.D.extra[kind] && NEW.D.extra[kind][k];
    if (kind === 'sprites') {
      need(n && n.length, `extra.sprites['${k}']`);
      if (n && n.length !== v.length) warn.push(`extra.sprites['${k}'] ${v.length} -> ${n.length} khung`);
    } else need(n && NEW.D.anims[n], `extra.${kind}['${k}']`);
  }
}
for (const [nm, parts] of Object.entries(OLD.D.prefabs)) {
  const np = NEW.D.prefabs[nm];
  need(np, `prefab ${nm}`);
  if (!np) continue;
  const byN = new Map(np.map(p => [p.n, p]));
  for (const p of parts) {
    const q = byN.get(p.n);
    if (lits.has(p.n) || lits.has('/' + p.n.split('/').slice(1).join('/'))) need(q, `prefab ${nm} part '${p.n}'`);
    if (!q) continue;
    if (p.f) need(q.f || q.a, `prefab ${nm} part '${p.n}' sprite`);
    for (const st of Object.keys(p.a || {})) need(q.a && q.a[st], `prefab ${nm} part '${p.n}' state '${st}'`);
  }
}
for (const id of Object.keys(OLD.D.enemies)) {
  const e = NEW.D.enemies[id];
  need(e, `enemy ${id}`);
  if (!e) continue;
  for (const st of Object.keys(OLD.D.enemies[id].anims || {})) need(e.anims && e.anims[st], `enemy ${id} state '${st}'`);
  if (OLD.D.enemies[id].body) need(e.body, `enemy ${id} body`);
}
for (const [id, th] of Object.entries(OLD.D.themes)) {
  const n = NEW.D.themes[id];
  need(n, `theme ${id}`);
  if (!n) continue;
  for (const k of ['bg', 'lib', 'tiles', 'stages']) if (th[k]) need(n[k], `theme ${id}.${k}`);
  for (const st of Object.keys(th.stages || {})) need(n.stages && n.stages[st], `theme ${id} stage ${st}`);
  for (const e of th.enemies) need(n.enemies.includes(e), `theme ${id} enemy ${e}`);
}
for (const k of Object.keys(OLD.D.patterns)) need(NEW.D.patterns[k], `pattern ${k}`);
need(NEW.D.sprites.bullets.length >= OLD.D.sprites.bullets.length, `sprites.bullets ${OLD.D.sprites.bullets.length} -> ${NEW.D.sprites.bullets.length}`);
for (const b of OLD.D.sprites.bullets) if (lits.has(b)) need(NEW.A.f[b], `bullet sprite ${b}`);

// mọi khung mà dữ liệu mới nhắc tới phải có trong atlas mới
const F = NEW.A.f;
const dangling = new Set();
const fr = (f, where) => { if (f && typeof f === 'string' && !F[f]) dangling.add(`${f} (${where})`); };
for (const [k, a] of Object.entries(NEW.D.anims)) a.f.forEach(f => fr(f, 'anim ' + k));
for (const [k, parts] of Object.entries(NEW.D.prefabs)) parts.forEach(p => fr(p.f, 'prefab ' + k));
for (const [k, e] of Object.entries(NEW.D.enemies)) {
  fr(e.body, 'enemy ' + k); fr(e.shadow, 'enemy ' + k);
  for (const w of e.weapons || []) { fr(w.sprite, 'enemy ' + k); fr(w.muzzle, 'enemy ' + k); }
}
for (const [k, b] of Object.entries(NEW.D.bullets)) fr(b.sprite, 'bullet ' + k);
for (const [k, th] of Object.entries(NEW.D.themes)) {
  th.tiles.floor.forEach(f => fr(f, 'theme ' + k));
  th.tiles.wall.forEach(w => { fr(w.front, 'theme ' + k); fr(w.top, 'theme ' + k); });
}
NEW.D.sprites.bullets.forEach(f => fr(f, 'sprites.bullets'));
for (const [k, l] of Object.entries(NEW.D.extra.sprites)) l.forEach(f => fr(f, 'extra.sprites ' + k));
NEW.D.hud.forEach(h => fr(h.f, 'hud ' + h.p));
for (const d of dangling) missing.push('dangling frame ' + d);

// trang atlas: cỡ + tồn tại
for (const p of NEW.A.pages) {
  const fp = path.join(OUTDIR, p);
  if (!fs.existsSync(fp)) { missing.push('page missing ' + p); continue; }
  const b = fs.readFileSync(fp);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (w > 4096 || h > 4096) missing.push(`page ${p} ${w}x${h} > 4096`);
}

console.log(`runtime literals: ${lits.size}; referenced frames ${nFrames}, anims ${nAnims}, prefabs ${nPrefabs}`);
console.log(`old: ${Object.keys(OLD.A.f).length} frames, ${Object.keys(OLD.D.anims).length} anims, ${OLD.A.pages.length} pages; ` +
  `new: ${Object.keys(NEW.A.f).length} frames, ${Object.keys(NEW.D.anims).length} anims, ${NEW.A.pages.length} pages`);
if (warn.length) { console.log(`warn (${warn.length}):`); warn.slice(0, 60).forEach(w => console.log('  ' + w)); }
if (missing.length) {
  console.log(`MISSING (${missing.length}):`);
  missing.slice(0, 200).forEach(m => console.log('  ' + m));
  process.exit(1);
}
console.log('OK: mọi khoá được dùng đều còn.');
