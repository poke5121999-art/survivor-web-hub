#!/usr/bin/env node
// Regenerates supabase/functions/rc-rpc/ from the ORIGINAL Restaurant City
// server (github.com/Dippys/Restaurant-City-Server, cloned at D:/rc-ref/server):
//   1. Prisma client for Deno from server/prisma/schema.postgresql.prisma -> generated/
//   2. esbuild bundle of the RPC + persistence code + tools/rpc-shims -> rpc.bundle.js
//   3. index.ts (Deno entry) + deno.json
// The server checkout is only read, never modified.
//
// Usage: node games/restaurant-city/tools/build-rpc.mjs [--server D:/rc-ref/server] [--out <dir>]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const HUB = path.resolve(TOOLS, '../../..');
const SHIMS = path.join(TOOLS, 'rpc-shims');
const ESBUILD_VERSION = '0.25.10';
const PRISMA_CLIENT_VERSION = '7.8.0';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SERVER = path.resolve(arg('--server', 'D:/rc-ref/server'));
const SRC = path.join(SERVER, 'src');
const OUT = path.resolve(arg('--out', path.join(HUB, 'supabase/functions/rc-rpc')));
const CACHE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'rc-rpc-build');

function fail(message) {
  console.error(`build-rpc: ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 300_000, shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stdout || ''}${r.stderr || ''}${r.error || ''}`);
  return (r.stdout || '').trim();
}

if (!fs.existsSync(path.join(SRC, 'rpc/index.ts'))) fail(`original server not found at ${SERVER}`);

// ---- 0. provenance -------------------------------------------------------------
const head = run('git', ['-C', SERVER, 'rev-parse', 'HEAD']);
const dirty = spawnSync('git', ['-C', SERVER, 'diff', '--ignore-all-space', '--quiet', '--', 'src', 'prisma'], { shell: process.platform === 'win32' }).status !== 0;
console.log(`server ${SERVER} HEAD ${head}${dirty ? ' (src/prisma have local changes!)' : ''}`);

// ---- 1. Prisma client for Deno -------------------------------------------------
const prismaCli = path.join(SERVER, 'node_modules/prisma/build/index.js');
if (!fs.existsSync(prismaCli)) fail(`prisma CLI missing: run npm install in ${SERVER}`);
const prismaDir = path.join(CACHE, 'prisma');
fs.mkdirSync(prismaDir, { recursive: true });
const schemaSrc = fs.readFileSync(path.join(SERVER, 'prisma/schema.postgresql.prisma'), 'utf8');
const generator = `generator client {
  provider = "prisma-client"
  runtime  = "deno"
  moduleFormat = "esm"
  generatedFileExtension = "ts"
  importFileExtension = "ts"
  output   = "./generated"
}`;
const schema = schemaSrc.replace(/generator client \{[\s\S]*?\}/, generator);
if (schema === schemaSrc) fail('generator block not found in schema.postgresql.prisma');
fs.writeFileSync(path.join(prismaDir, 'schema.prisma'), schema);
fs.rmSync(path.join(prismaDir, 'generated'), { recursive: true, force: true });
run(process.execPath, [prismaCli, 'generate', '--schema', 'schema.prisma'], { cwd: prismaDir, shell: false });

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(path.join(OUT, 'generated'), { recursive: true, force: true });
fs.cpSync(path.join(prismaDir, 'generated'), path.join(OUT, 'generated'), { recursive: true });
const classTs = path.join(OUT, 'generated/internal/class.ts');
let classSrc = fs.readFileSync(classTs, 'utf8');
for (const file of ['query_compiler_fast_bg.postgresql.mjs', 'query_compiler_fast_bg.postgresql.wasm-base64.mjs']) {
  const from = `import("@prisma/client/runtime/${file}")`;
  if (!classSrc.includes(from)) fail(`generated class.ts has no ${from}`);
  classSrc = classSrc.replace(from, `import("npm:@prisma/client@${PRISMA_CLIENT_VERSION}/runtime/${file}")`);
}
fs.writeFileSync(classTs, classSrc);
console.log('prisma client -> generated/ (class.ts runtime imports pinned to npm:)');

// ---- 2. esbuild bundle ---------------------------------------------------------
function loadEsbuild() {
  const req = createRequire(path.join(CACHE, 'package.json'));
  try {
    const esbuild = req('esbuild');
    if (esbuild.version === ESBUILD_VERSION) return esbuild;
  } catch { /* install below */ }
  fs.mkdirSync(CACHE, { recursive: true });
  if (!fs.existsSync(path.join(CACHE, 'package.json'))) fs.writeFileSync(path.join(CACHE, 'package.json'), '{"private":true}\n');
  run('npm', ['install', '--no-audit', '--no-fund', `esbuild@${ESBUILD_VERSION}`], { cwd: CACHE });
  return createRequire(path.join(CACHE, 'package.json'))('esbuild');
}
const esbuild = loadEsbuild();

const norm = (p) => path.resolve(p).replace(/\\/g, '/');
const SRC_N = norm(SRC);
const inServer = (file) => file && norm(file).startsWith(`${SRC_N}/`);
const ALIASES = new Map([
  [norm(path.join(SRC, 'db/client.ts')), path.join(SHIMS, 'db-client.ts')],
  [norm(path.join(SRC, 'live-events.ts')), path.join(SHIMS, 'live-events.ts')],
]);
// Build-time text patches on the original sources (each must match exactly once).
const PATCHES = new Map([
  [norm(path.join(SRC, 'db/rpc-store.ts')), [
    // Edge: each async poll is an edge invocation; poll about once a minute.
    ['minPollInterval: request.synchronous ? 30000 : 5000,', 'minPollInterval: request.synchronous ? 30000 : 60000,'],
  ]],
]);

function resolveTs(base) {
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const dataFiles = Object.fromEntries(fs.readdirSync(path.join(SERVER, 'public/data'))
  .filter((f) => f.endsWith('.xml'))
  .map((f) => [f, fs.readFileSync(path.join(SERVER, 'public/data', f), 'utf8')]));

const rcPlugin = {
  name: 'rc-edge',
  setup(build) {
    build.onResolve({ filter: /^@rc\// }, (args) => {
      const file = resolveTs(path.join(SRC, args.path.slice(4)));
      if (!file) return { errors: [{ text: `no server source for ${args.path}` }] };
      return { path: ALIASES.get(norm(file)) ?? file };
    });
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!inServer(args.importer)) return undefined;
      const file = resolveTs(path.join(args.resolveDir, args.path));
      if (!file) return undefined;
      return { path: ALIASES.get(norm(file)) ?? file };
    });
    build.onResolve({ filter: /^(node:)?fs$/ }, (args) => (inServer(args.importer) ? { path: path.join(SHIMS, 'fs.ts') } : undefined));
    build.onResolve({ filter: /^sharp$/ }, () => ({ path: path.join(SHIMS, 'sharp.cjs') }));
    build.onResolve({ filter: /^rc-data:files$/ }, () => ({ path: 'files', namespace: 'rc-data' }));
    build.onLoad({ filter: /.*/, namespace: 'rc-data' }, () => ({ contents: JSON.stringify(dataFiles), loader: 'json' }));
    // The PNG encoder behind /__api/profile-image lives (unexported) in
    // http-server.ts, which drags in the whole HTTP server. Lift those exact
    // functions out instead of rewriting them.
    build.onResolve({ filter: /^rc-png:encoder$/ }, () => ({ path: 'encoder', namespace: 'rc-png' }));
    build.onLoad({ filter: /.*/, namespace: 'rc-png' }, () => {
      const http = fs.readFileSync(path.join(SRC, 'http-server.ts'), 'utf8');
      const start = http.indexOf('function encodeArgbPng(');
      const end = http.indexOf('function readBody(');
      if (start < 0 || end < start) return { errors: [{ text: 'encodeArgbPng..readBody not found in http-server.ts' }] };
      const body = http.slice(start, end);
      for (const fn of ['function pngHeader(', 'function pngChunk(', 'function crc32(', 'const CRC32_TABLE']) {
        if (!body.includes(fn)) return { errors: [{ text: `${fn} missing from the lifted PNG encoder` }] };
      }
      return { contents: `import * as zlib from 'node:zlib';\n${body}\nexport { encodeArgbPng };\n`, loader: 'ts', resolveDir: SRC };
    });
    build.onResolve({ filter: /^\.\/generated\/client\.ts$/ }, () => ({ path: './generated/client.ts', external: true }));
    build.onLoad({ filter: /\.ts$/ }, (args) => {
      if (!inServer(args.path)) return undefined;
      let contents = fs.readFileSync(args.path, 'utf8');
      for (const [from, to] of PATCHES.get(norm(args.path)) ?? []) {
        const count = contents.split(from).length - 1;
        if (count !== 1) return { errors: [{ text: `patch target found ${count}x in ${args.path}: ${from}` }] };
        contents = contents.replace(from, to);
      }
      if (/\b__dirname\b/.test(contents)) {
        // The original resolves public/data relative to its own directory.
        const rel = path.relative(SERVER, path.dirname(args.path)).replace(/\\/g, '/');
        contents = `const __dirname = ${JSON.stringify(`/rc/server/${rel}`)};\n${contents}`;
      }
      return { contents, loader: 'ts' };
    });
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(SHIMS, 'rpc-main.ts')],
  outfile: path.join(OUT, 'rpc.bundle.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: ['node:*', '@prisma/adapter-pg', 'npm:*'],
  plugins: [rcPlugin],
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
  banner: {
    js: [
      `// GENERATED by games/restaurant-city/tools/build-rpc.mjs - do not edit.`,
      `// Original server: Dippys/Restaurant-City-Server @ ${head}${dirty ? ' (+local changes)' : ''}`,
      `import { Buffer } from "node:buffer";`,
      `import process from "node:process";`,
      `import { setTimeout, clearTimeout, setInterval, clearInterval } from "node:timers";`,
    ].join('\n'),
  },
});

const included = Object.keys(result.metafile.inputs)
  .filter((f) => !f.startsWith('rc-data:'))
  .map((f) => norm(path.resolve(f)))
  .filter((f) => f.startsWith(`${SRC_N}/`))
  .map((f) => f.slice(SRC_N.length + 1))
  .sort();
console.log(`bundle: ${included.length} original modules: ${included.join(', ')}`);
const externals = new Set();
for (const out of Object.values(result.metafile.outputs)) for (const imp of out.imports) if (imp.external) externals.add(imp.path);
console.log(`bundle externals: ${[...externals].sort().join(', ')}`);

// ---- 3. entry + import map -----------------------------------------------------
fs.copyFileSync(path.join(SHIMS, 'index.ts'), path.join(OUT, 'index.ts'));
fs.writeFileSync(path.join(OUT, 'deno.json'), `${JSON.stringify({
  imports: {
    '@prisma/client/runtime/client': `npm:@prisma/client@${PRISMA_CLIENT_VERSION}/runtime/client`,
    pg: 'npm:pg@8.16.3',
    '@prisma/adapter-pg': `npm:@prisma/adapter-pg@${PRISMA_CLIENT_VERSION}`,
  },
}, null, 2)}\n`);
const kb = (f) => `${Math.round(fs.statSync(path.join(OUT, f)).size / 1024)} KB`;
console.log(`wrote ${OUT}: index.ts, deno.json, rpc.bundle.js (${kb('rpc.bundle.js')}), generated/`);
