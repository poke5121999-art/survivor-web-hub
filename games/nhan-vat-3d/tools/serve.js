// Tiny static server for local checks. Serves this folder at / and (read-only) the Lanternfall checkout at /ref/.
// It exits on its own after LIFE seconds so a forgotten server never lingers.
// Usage: node tools/serve.js [port=8765] [life seconds=900]   env LF_SRC = Lanternfall checkout (default D:/lanternfall-ref)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = +(process.argv[2] || 8765), LIFE = +(process.argv[3] || 900);
const ROOT = path.resolve(__dirname, '..');
const REF = path.resolve(process.env.LF_SRC || 'D:/lanternfall-ref');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.md': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg' };
const srv = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let u = decodeURIComponent(req.url.split('?')[0]);
  let base = ROOT;
  if (u.startsWith('/ref/')) { base = REF; u = u.slice(4); }
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(base, u);
  if (!f.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
srv.listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}/ and ${REF} at /ref/ for ${LIFE}s`));
setTimeout(() => { console.log('serve.js: lifetime over, exiting'); process.exit(0); }, LIFE * 1000).unref();
