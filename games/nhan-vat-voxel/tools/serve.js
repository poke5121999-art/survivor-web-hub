// Tiny static server for local checks (serves the voxel-chars folder). Exits on its own after LIFE seconds.
// Usage: node tools/serve.js [port=8790] [life seconds=900]
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +(process.argv[2] || 8790), LIFE = +(process.argv[3] || 900), ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(ROOT, u); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  });
});
srv.listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}/ for ${LIFE}s`));
setTimeout(() => process.exit(0), LIFE * 1000).unref();
module.exports = { PORT };
