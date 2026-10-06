#!/usr/bin/env node
// Lever trich xuat Soul Knight -> Tron Tim. Doc games/soulknight/data/*.js (chi doc), ghi vao games/tron-tim/.
//   node games/tron-tim/tools/extract_sk.js           du lieu + art + tieng + chep ma
//   node games/tron-tim/tools/extract_sk.js --code    chi chep js/sk/{engine,world,vfx}.js nguyen van
//   node games/tron-tim/tools/extract_sk.js --data    chi du lieu/art/tieng
// Danh sach khoa chon: tools/picks.json. Khoa bat buoc thieu => liet ke het va thoat ma 1.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');

const TT = path.resolve(__dirname, '..');
const SKD = path.resolve(TT, '..', 'soulknight');
const REPO = path.resolve(TT, '..', '..');
const args = new Set(process.argv.slice(2));
const doCode = args.has('--code') || !args.has('--data');
const doData = args.has('--data') || !args.has('--code');

function git(a) {
  try { return cp.execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim(); } catch (e) { return ''; }
}
function commitOf(rel) {
  const h = git(['log', '-1', '--format=%h', '--', rel]) || 'unknown';
  const dirty = git(['status', '--short', '--', rel]) ? '+dirty' : '';
  return h + dirty;
}

// ------------------------------------------------------------------ chep ma
const CODE = ['engine.js', 'world.js', 'vfx.js'];
if (doCode) {
  fs.mkdirSync(path.join(TT, 'js', 'sk'), { recursive: true });
  for (const f of CODE) {
    const src = fs.readFileSync(path.join(SKD, 'js', f), 'utf8');
    const c = commitOf('games/soulknight/js/' + f);
    const head = '// Copied from games/soulknight/js/' + f + ' @ ' + c + '; do not edit here, rerun tools/extract_sk.js --code\n';
    fs.writeFileSync(path.join(TT, 'js', 'sk', f), head + src);
    console.log('code  js/sk/' + f + '  @ ' + c + '  ' + (head.length + src.length) + ' B');
  }
}
if (!doData) process.exit(0);

// ------------------------------------------------------------------ nap du lieu
function load(file) {
  global.window = global;
  (0, eval)(fs.readFileSync(path.join(SKD, 'data', file), 'utf8'));
}
for (const f of ['sk-data.js', 'sk-vfx.js', 'sk-audio.js', 'sk-skills86.js']) load(f);
const A = global.SK_ATLAS, D = global.SK_DATA, V = global.SK_VFX, AU = global.SK_AUDIO, S86 = global.SK_SKILLS86;
const picks = JSON.parse(fs.readFileSync(path.join(__dirname, 'picks.json'), 'utf8'));

const missing = [];      // loi bat buoc
const absent = [];       // vang mat nhung duoc phep (bao cao)
const warns = [];        // khung phu khong co trong atlas (vd UISprite, glow)
const need = { anims: new Set(), frames: new Set(), prefabs: new Set(), ctrl: new Set(), vfx: new Set(), vfxFrames: new Set(), clips: new Set() };

function addFrame(name, must, why) {
  if (!name) return;
  if (A.f[name]) need.frames.add(name);
  else if (must) missing.push('frame:' + name + ' (' + why + ')');
  else warns.push(name);
}
function addAnim(key, must, why) {
  if (need.anims.has(key)) return;
  const a = D.anims[key];
  if (!a) { if (must) missing.push('anim:' + key + ' (' + why + ')'); else warns.push('anim:' + key); return; }
  need.anims.add(key);
  for (const f of a.f || []) addFrame(f, true, 'anim ' + key);
}
function addPrefab(name, why) {
  if (need.prefabs.has(name)) return true;
  const p = D.prefabs[name];
  if (!p) return false;
  need.prefabs.add(name);
  for (const part of p) {
    if (part.f) addFrame(part.f, false);
    if (part.a) for (const k of Object.values(part.a)) addAnim(k, false);
  }
  return true;
}

// nhan vat
for (const h of picks.heroes) {
  const H = D.heroes[h], s = H && H.s0;
  if (!s) { missing.push('hero:' + h); continue; }
  for (const k of [s.idle, s.run, s.dead, ...Object.values(s.layers || {})]) if (k) addAnim(k, true, 'hero ' + h);
  if (s.ctrl) { if (D.ctrl[s.ctrl]) need.ctrl.add(s.ctrl); else missing.push('ctrl:' + s.ctrl + ' (hero ' + h + ')'); }
}
// ban do
const TH = D.themes[picks.theme];
const themeOut = {};
if (!TH) missing.push('theme:' + picks.theme);
else {
  for (const k of ['level', 'bundle', 'floors', 'walls', 'obstacles', 'bg', 'libraryKey', 'lib', 'tiles']) if (TH[k] !== undefined) themeOut[k] = TH[k];
  for (const f of TH.tiles.floor) addFrame(f, true, 'theme floor');
  for (const w of TH.tiles.wall) { addFrame(w.front, true, 'theme wall'); addFrame(w.top, true, 'theme wall'); }
  for (const grp of ['floors', 'walls', 'obstacles'])
    for (const p of TH[grp] || []) for (const l of p.layers || []) addFrame(l.f, false);
  for (const v of Object.values(TH.lib || {})) addPrefab(v);
}
for (const n of picks.prefabs) if (!addPrefab(n)) missing.push('prefab:' + n);
for (const n of picks.prefabsOptional || []) if (!addPrefab(n)) absent.push('prefab:' + n);
for (const f of picks.frames || []) addFrame(f, true, 'picks.frames');

// ky nang (con so tho)
const skills = {};
const skillFx = [], skillSfx = [];
for (const [h, id] of Object.entries(picks.skills)) {
  const hs = S86.heroes[h], sk = hs && hs.skills.find(x => x.id === id);
  if (!sk) { missing.push('skill:' + h + '/' + id); continue; }
  skills[id] = { hero: h, c: hs.c, ctrlFields: hs.ctrlFields, skill: sk };
  for (const n of sk.fx || []) skillFx.push(n);
  for (const n of sk.sfx || []) skillSfx.push(n);
}

// vfx
function vfxFramesOf(name) {
  const out = new Set(), eff = V.effects[name];
  (function w(o, key) {
    if (typeof o === 'string') { if (V.atlas.f[o]) out.add(o); return; }
    if (Array.isArray(o)) { o.forEach(x => w(x)); return; }
    if (o && typeof o === 'object') for (const k in o) if (k !== 'n' && k !== 'name') w(o[k], k);
  })(eff);
  return out;
}
const vfxWant = new Set(picks.vfx);
for (const n of skillFx) vfxWant.add(n);
for (const n of [...vfxWant].sort()) {
  if (V.effects[n]) { need.vfx.add(n); for (const f of vfxFramesOf(n)) need.vfxFrames.add(f); }
  else if (addPrefab(n)) { /* khong phai vfx nhung la prefab (vd effect_priest_1) */ }
  else absent.push('vfx:' + n + (picks.vfx.includes(n) ? '' : ' (tu skill.fx)'));
}

// tieng
const clipFiles = {};
function addClip(n, must, why) {
  if (!n) return;
  if (AU.clips[n]) need.clips.add(n);
  else if (must) missing.push('clip:' + n + ' (' + why + ')'); else absent.push('clip:' + n + ' (' + why + ')');
}
for (const n of picks.audio.clips) addClip(n, true, 'picks.audio.clips');
for (const n of skillSfx) addClip(n, false, 'skill.sfx');
const byHero = {};
for (const h of picks.audio.byHero) {
  const b = AU.byHero[h];
  if (!b) { absent.push('audio.byHero:' + h); continue; }
  byHero[h] = b;
  for (const [k, v] of Object.entries(b)) {
    if (k === 'prefab' || k === 'guess') continue;
    for (const n of Array.isArray(v) ? v : [v]) addClip(n, true, 'byHero.' + h + '.' + k);
  }
}
const music = {};
for (const [role, n] of Object.entries(picks.audio.music)) { addClip(n, true, 'music.' + role); music[role] = n; }

if (missing.length) {
  console.error('THIEU ' + missing.length + ' khoa:\n  ' + missing.join('\n  '));
  process.exit(1);
}

// ------------------------------------------------------------------ xep lai atlas
const sorted = o => Array.isArray(o) ? o.map(sorted) : (o && typeof o === 'object')
  ? Object.keys(o).sort().reduce((r, k) => (r[k] = sorted(o[k]), r), {}) : o;
const mainNames = [...need.frames].sort();
const vfxNames = [...need.vfxFrames].sort();
const smoothSet = new Set(V.atlas.smooth || []);
const job = {
  sets: [
    { name: 'sk', pad: 2, maxSize: 2048, ext: 'png', outPrefix: path.join(TT, 'art', 'sk', 'atlas'),
      srcPages: A.pages.map(p => path.join(SKD, p)), rects: mainNames.map(n => { const f = A.f[n]; return [f[0], f[1], f[2], f[3], f[4], 0]; }) },
    { name: 'vfx', pad: 2, maxSize: 2048, ext: 'webp', quality: 92, outPrefix: path.join(TT, 'art', 'vfx', 'vfx_tt'),
      srcPages: V.atlas.pages.map(p => path.join(SKD, p)), rects: vfxNames.map(n => { const f = V.atlas.f[n]; return [f[0], f[1], f[2], f[3], f[4], smoothSet.has(n) ? 1 : 0]; }) }
  ]
};
for (const d of ['art/sk', 'art/vfx', 'art/audio']) fs.mkdirSync(path.join(TT, d), { recursive: true });
// don cac trang cu do lan chay truoc de lai
for (const [dir, re] of [['art/sk', /^atlas\d+\.png$/], ['art/vfx', /^vfx_tt\d+\.webp$/]])
  for (const f of fs.readdirSync(path.join(TT, dir))) if (re.test(f)) fs.unlinkSync(path.join(TT, dir, f));
const tmp = path.join(require('os').tmpdir(), 'tt_pack_' + process.pid);
fs.writeFileSync(tmp + '.job.json', JSON.stringify(job));
// Chon python co Pillow: node co the thay python khac voi shell (WindowsApps khong co PIL). Dat PYTHON=... de ep.
const pyEnv = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' });
const probe = (cmd, sh) => cp.spawnSync(cmd, ['-I', '-c', '"import PIL"'], { shell: sh, env: pyEnv }).status === 0;
const py = [[process.env.PYTHON, true], ['python', true], ['python', false], ['py', false]].filter(c => c[0]).find(c => probe(c[0], c[1]));
if (!py) { console.error('khong tim thay python co Pillow (dat bien PYTHON)'); process.exit(2); }
const q = s => '"' + s + '"';
const r = cp.spawnSync(py[0], ['-I', q(path.join(__dirname, 'pack_atlas.py')), q(tmp + '.job.json'), q(tmp + '.res.json')],
  { stdio: 'inherit', env: pyEnv, shell: py[1] });
if (r.status !== 0) { console.error('pack_atlas.py loi'); process.exit(2); }
const res = JSON.parse(fs.readFileSync(tmp + '.res.json', 'utf8'));
fs.unlinkSync(tmp + '.job.json'); fs.unlinkSync(tmp + '.res.json');

function rebuild(names, srcF, rs) {
  const f = {};
  names.forEach((n, i) => { const o = srcF[n], p = rs.place[i]; f[n] = [p[0], p[1], p[2], o[3], o[4], ...o.slice(5)]; });
  return f;
}
const hashOf = pages => crypto.createHash('sha1').update(Buffer.concat(pages.map(p => fs.readFileSync(p)))).digest('hex').slice(0, 10);
const skPages = res.sets[0].pages.map(n => 'art/sk/' + n), vfPages = res.sets[1].pages.map(n => 'art/vfx/' + n);
const SK_ATLAS = { pages: skPages, v: hashOf(skPages.map(p => path.join(TT, p))), f: rebuild(mainNames, A.f, res.sets[0]) };
const vfxAtlas = { pages: vfPages, f: rebuild(vfxNames, V.atlas.f, res.sets[1]), smooth: (V.atlas.smooth || []).filter(n => vfxNames.includes(n)) };
const vfxFrameSet = new Set(vfxNames);
for (const e of ['smooth']) if (!vfxAtlas[e].length) delete vfxAtlas[e];

// ------------------------------------------------------------------ du lieu
const SK_DATA = {
  ppu: D.ppu,
  anims: {}, ctrl: {}, heroes: {}, themes: { [picks.theme]: themeOut }, prefabs: {}, patterns: {}, extra: {}
};
for (const k of need.anims) SK_DATA.anims[k] = D.anims[k];
for (const k of need.ctrl) SK_DATA.ctrl[k] = D.ctrl[k];
for (const h of picks.heroes) SK_DATA.heroes[h] = D.heroes[h];
for (const k of need.prefabs) SK_DATA.prefabs[k] = D.prefabs[k];

const SK_VFX = { v: V.v, ppu: V.ppu, layers: V.layers, atlas: vfxAtlas, effects: {}, refs: {}, weapons: {} };
for (const n of need.vfx) SK_VFX.effects[n] = V.effects[n];

// tieng: chep tep, giu ten
const clips = {};
let audioBytes = 0;
for (const n of [...need.clips].sort()) {
  const c = AU.clips[n];
  clips[n] = c;
  const src = path.join(SKD, 'art', 'audio', c.file), dst = path.join(TT, 'art', 'audio', c.file);
  if (!fs.existsSync(src)) { console.error('thieu tep tieng: ' + src); process.exit(1); }
  fs.copyFileSync(src, dst);
  audioBytes += fs.statSync(dst).size;
}
const events = {};
for (const [k, v] of Object.entries(AU.events)) if (clips[v]) events[k] = v;
const SK_AUDIO = { clips, events, byHero, music };
// xoa tep tieng cu khong con duoc chon
const keep = new Set(Object.values(clips).map(c => c.file));
for (const f of fs.readdirSync(path.join(TT, 'art', 'audio'))) if (!keep.has(f)) fs.unlinkSync(path.join(TT, 'art', 'audio', f));

function line(o) { // moi khoa cap 1 mot dong, khoa da sap xep
  const s = sorted(o);
  if (!s || typeof s !== 'object' || Array.isArray(s)) return JSON.stringify(s);
  const ks = Object.keys(s);
  return '{\n' + ks.map(k => JSON.stringify(k) + ':' + JSON.stringify(s[k])).join(',\n') + '\n}';
}
const commit = commitOf('games/soulknight/data');
const header = '// Sinh boi games/tron-tim/tools/extract_sk.js tu games/soulknight/data (git ' + commit + ') - dung sua tay.\n' +
  '// SK_ATLAS.v nguon=' + A.v + '  SK_VFX.v nguon=' + V.v + '\n' +
  '// vang mat (bo qua): ' + (absent.length ? absent.join(', ') : 'khong') + '\n';
const out = header +
  'window.SK_ATLAS=' + line(SK_ATLAS) + ';\n' +
  'window.SK_DATA=' + line(SK_DATA) + ';\n' +
  'window.SK_VFX=' + line(SK_VFX) + ';\n' +
  'window.SK_AUDIO=' + line(SK_AUDIO) + ';\n' +
  'window.TT_SKILLS86=' + line(skills) + ';\n';
fs.mkdirSync(path.join(TT, 'data'), { recursive: true });
fs.writeFileSync(path.join(TT, 'data', 'sk-subset.js'), out);

const sz = p => fs.statSync(path.join(TT, p)).size;
console.log('data/sk-subset.js ' + sz('data/sk-subset.js') + ' B');
for (const p of [...skPages, ...vfPages]) console.log(p + ' ' + sz(p) + ' B');
console.log('audio ' + Object.keys(clips).length + ' clips, ' + audioBytes + ' B');
console.log('anims ' + need.anims.size + ', frames ' + mainNames.length + ', prefabs ' + need.prefabs.size + ', vfx ' + need.vfx.size + ' (frames ' + vfxNames.length + ')');
if (absent.length) console.log('ABSENT (skipped): ' + absent.join(', '));
if (warns.length) console.log('frame ngoai atlas (bo qua): ' + [...new Set(warns)].sort().join(', '));
