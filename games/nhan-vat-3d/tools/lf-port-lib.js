// Shared helpers for the Lanternfall port generators (tools/port-lf-*.js).
// Reads the pinned Lanternfall source (line endings normalised to LF, sha256 checked), slices line ranges,
// applies anchored replacements that throw when an anchor is missing, checks the result against three.js r170
// (every THREE.X name must be exported by vendor/three.module.min.js and every shader chunk that onBeforeCompile
// patches must exist in r170's ShaderLib), resolves free identifiers to the host shim or a sibling module, and
// writes a credited ES module into lib/lf/.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const COMMIT = 'ada0fd528d3dfdf860719e65e7b2a7f8017119f9';
// sha256 of each used file as stored in git (LF line endings). A checkout with core.autocrlf=true has CRLF on
// disk; readSrc strips \r before hashing, so both checkouts verify and both produce the same output.
const PIN = {
  'src/00-util.js': 'a0754ad14342dee3f8a57a99337ff6869aab58d79e4343e6cec8566ae793db50',
  'src/10-kit.js': 'd7035f2698ac4e59bdeba1270a6d254b7bde4a86ad5504481896a5f6ef0ef361',
  'src/20-human.js': 'cf64ffed5b0cad8e8e5ee2706555537d7f554999df02b8fd843c3d4c4239dbc1',
  'src/20b-wardrobe.js': 'e4f349e57a72cfd96bcfaebffb57b04ad014b8d68e7951985ca0601923b5f5cf',
  'src/21-heroes.js': '89c060006e632e21800ad1f0e22743c70032d8f530947444f20386f19ce0822c',
  'src/22-monsters.js': '3976e87da0ff2d8811d6db1406e96bf1120d39900e7abb26aec33fa3dfd677b1',
  'src/25-anim.js': '457bac81ec67263701362898f85b5a678eeba88710e9814188e7876b60ebbdff',
  'src/30-world.js': 'fd4035ee80fc36396bb4c32cc72d86a028941317f004eb233bef23060d873299',
  'src/40-post.js': 'd66d9d26c07069897b4628c3059a5aacf9f8a75564e58d56167e4ee3df3edad8',
  'src/50-fx.js': '301f5f2819a348ec6531376445d0aa3fba1485dc92d574c238f8f401281fe71c',
  'src/90-main.js': 'a95ac12e84fa7c6f36d60d0b2178e93b3639e5316206795da364a155a48cba1a',
};
// generation order; a module may import only from modules before it
const ORDER = ['util', 'kit', 'human', 'anim', 'heroes', 'monsters', 'world', 'post', 'fx', 'gallery'];
// names the host shim (lib/lf-host.js) provides
const HOST = ['THREE', 'LF', 'QS', 'qnum'];
const BROWSER = ['window', 'document', 'performance', 'navigator', 'requestAnimationFrame', 'location'];

function loadAcorn() {
  const tries = [process.env.ACORN, 'acorn', 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@google/gemini-cli/node_modules/acorn'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* try next */ } }
  throw new Error('acorn not found: set ACORN=<path to acorn package> or run `npm i acorn` in tools/');
}
const acorn = loadAcorn();

function srcRoot() {
  const cands = [process.env.LF_SRC, path.join(os.homedir(), 'lanternfall-ref', 'repo'), 'D:/lanternfall-ref'].filter(Boolean);
  for (const c of cands) if (fs.existsSync(path.join(c, 'src', '10-kit.js'))) return c;
  throw new Error('Lanternfall source not found (tried ' + cands.join(', ') + '); run scripts/fetch-lanternfall.sh or set LF_SRC');
}

const cache = {};
function readSrc(rel) {
  if (cache[rel]) return cache[rel];
  if (!PIN[rel]) throw new Error('file not pinned: ' + rel);
  const text = fs.readFileSync(path.join(srcRoot(), rel), 'utf8').replace(/\r\n/g, '\n');
  const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  if (sha !== PIN[rel]) throw new Error(`${rel} sha256 ${sha} does not match the pinned ${PIN[rel]} (source is not Lanternfall @ ${COMMIT.slice(0, 7)})`);
  const lines = text.split('\n');
  return (cache[rel] = { rel, lines, slice: (a, b) => { if (a < 1 || b > lines.length || a > b) throw new Error(`${rel}: bad range ${a}-${b} (file has ${lines.length} lines)`); return lines.slice(a - 1, b).join('\n'); } });
}

// pairs: [from, to] or [from, to, expectedCount]
function replaceAll(body, pairs, label) {
  for (const [a, b, n] of pairs) {
    const count = body.split(a).length - 1;
    if (!count) throw new Error(`${label} anchor missing: ${a.slice(0, 90)}`);
    if (n !== undefined && count !== n) throw new Error(`${label} anchor found ${count}x, expected ${n}x: ${a.slice(0, 90)}`);
    body = body.split(a).join(b);
  }
  return body;
}

function parse(code) { return acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' }); }

function freeIds(src) {
  const ast = acorn.parse('(async function(){\n' + src + '\n})', { ecmaVersion: 2022 });
  const decl = new Set(), refs = new Set();
  const pat = (p) => { if (!p) return; if (p.type === 'Identifier') decl.add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach((q) => pat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(pat); else if (p.type === 'AssignmentPattern') pat(p.left); else if (p.type === 'RestElement') pat(p.argument); };
  const walk = (n, parent, key) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclarator') pat(n.id);
    else if (/Function/.test(n.type)) { if (n.id) decl.add(n.id.name); n.params.forEach(pat); }
    else if (/^Class/.test(n.type) && n.id) decl.add(n.id.name);
    else if (n.type === 'CatchClause') pat(n.param);
    else if (n.type === 'Identifier') {
      const isProp = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) || (/Property|MethodDefinition/.test(parent.type) && key === 'key' && !parent.computed && !parent.shorthand));
      if (!isProp) refs.add(n.name);
    }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, n, k)); else if (v && typeof v.type === 'string') walk(v, n, k); }
  };
  walk(ast, null, null);
  return [...refs].filter((r) => !decl.has(r)).sort();
}

// names declared at the top level of a module (these become its exports)
function topLevelNames(code) {
  const out = [];
  for (const n of parse(code).body) {
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) { if (d.id.type === 'Identifier') out.push(d.id.name); }
    else if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) out.push(n.id.name);
  }
  return out;
}

/* ----- three.js r170 compatibility gate ----- */
let r170 = null;
async function loadR170() {
  if (r170) return r170;
  const file = path.join(ROOT, 'vendor', 'three.module.min.js');
  const T = await import(pathToFileURL(file).href);
  if (T.REVISION !== '170') throw new Error('vendor/three.module.min.js is r' + T.REVISION + ', expected r170');
  const std = T.ShaderLib.standard;
  return (r170 = { T, chunks: { vertex: std.vertexShader, fragment: std.fragmentShader } });
}
// APIs that existed in r158 (or earlier) and are gone or changed by r170
const REMOVED = [
  [/\bphysicallyCorrectLights\b/, 'physicallyCorrectLights was removed (r155); lights are physical by default'],
  [/\buseLegacyLights\b/, 'useLegacyLights was removed in r165'],
  [/\boutputEncoding\b|\bsRGBEncoding\b|\bLinearEncoding\b|\.encoding\s*=/, 'texture/renderer encoding was replaced by colorSpace (r152, removed r162)'],
  [/\bWebGL1Renderer\b/, 'WebGL1Renderer was removed in r163'],
  [/\bconvertSRGBToLinear\b|\bconvertLinearToSRGB\b/, 'Color.convertSRGBToLinear/LinearToSRGB: use colorSpace-aware setters'],
];
async function checkR170(code, label) {
  const { T, chunks } = await loadR170();
  for (const [re, why] of REMOVED) if (re.test(code)) throw new Error(`${label}: r170 trap: ${why}`);
  const names = new Set(); code.replace(/\bTHREE\.([A-Za-z0-9_]+)/g, (m, n) => names.add(n));
  const missing = [...names].filter((n) => !(n in T));
  if (missing.length) throw new Error(`${label}: not exported by three r170: ${missing.join(' ')}`);
  // every '#include <chunk>' that a shader patch replaces must still exist in r170's standard material
  const used = new Set(); code.replace(/replace\('#include <([a-z_]+)>'/g, (m, n) => used.add(n));
  const absent = [...used].filter((n) => !chunks.vertex.includes(`#include <${n}>`) && !chunks.fragment.includes(`#include <${n}>`));
  if (absent.length) throw new Error(`${label}: shader chunks missing from r170 MeshStandardMaterial: ${absent.join(' ')}`);
  return { threeNames: names.size, chunks: used.size };
}

/* ----- module writer ----- */
function header(spec) {
  const ranges = spec.from.map(([f, a, b]) => `${f}:${a}-${b}`).join(', ');
  return `// Ported from Lanternfall by loktar00 (github.com/loktar00/lanternfall @ ada0fd5). Generated by ${spec.tool}; do not edit by hand.
// Source lines: ${ranges}. All credit for this code goes to its author.
`;
}

// specs: array in ORDER; returns { name: {code, exports, text} }
async function build(specs) {
  const reg = {}; const out = {};
  for (const s of specs) {
    const free = freeIds(s.code);
    const host = [], from = {}, unresolved = [];
    for (const id of free) {
      if (HOST.includes(id)) { host.push(id); continue; }
      const owner = Object.keys(reg).find((m) => reg[m].includes(id));
      if (owner) { (from[owner] = from[owner] || []).push(id); continue; }
      if (id in globalThis || BROWSER.includes(id)) continue;
      unresolved.push(id);
    }
    if (unresolved.length) throw new Error(`${s.name}: unresolved identifiers: ${unresolved.join(' ')}`);
    const r = await checkR170(s.code, s.name);
    const exportsList = topLevelNames(s.code);
    let imports = '';
    if (host.length) imports += `import { ${host.join(', ')} } from '../lf-host.js';\n`;
    for (const m of ORDER) if (from[m]) imports += `import { ${from[m].join(', ')} } from './${m}.js';\n`;
    const text = header(s) + imports + s.code + '\n' + (exportsList.length ? `export { ${exportsList.join(', ')} };\n` : '');
    reg[s.name] = exportsList;
    out[s.name] = { text, exports: exportsList, check: r, file: s.out };
  }
  return out;
}

function specFor(name) { return require(path.join(__dirname, `port-lf-${name}.js`))(); }

// node tools/port-lf-<name>.js [outDir]  -> writes lib/lf/<name>.js (dependencies are sliced again to know their exports)
async function main(target, outDir) {
  const names = target === 'all' ? ORDER : ORDER.slice(0, ORDER.indexOf(target) + 1);
  if (!names.length) throw new Error('unknown module: ' + target);
  const built = await build(names.map(specFor));
  const dir = path.resolve(outDir || process.env.LF_OUT || path.join(ROOT, 'lib', 'lf'));
  fs.mkdirSync(dir, { recursive: true });
  for (const n of (target === 'all' ? names : [target])) {
    const b = built[n]; fs.writeFileSync(path.join(dir, b.file), b.text);
    console.log(`wrote ${path.relative(ROOT, path.join(dir, b.file)) || b.file}  ${b.text.length} chars, ${b.exports.length} exports, ${b.check.threeNames} THREE names, ${b.check.chunks} shader chunks checked`);
  }
  return built;
}
function run(target) { main(target, process.argv[2]).catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); }); }

module.exports = { ROOT, COMMIT, PIN, ORDER, readSrc, replaceAll, freeIds, topLevelNames, checkR170, build, main, run, specFor };
