// Dev server that reproduces the hub layout without the hub checkout: /games/repo3d/* is this repo,
// /js/* comes from dev/hub/js (copied from survivor-web-hub). Same API as the hub's tools/thumb-lib.js serve().
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const HUBJS = path.join(REPO, 'dev', 'hub', 'js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

function resolveUrl(u) {
  if (u.startsWith('/games/repo3d/')) return path.join(REPO, u.slice('/games/repo3d/'.length));
  if (u.startsWith('/js/')) return path.join(HUBJS, u.slice(4));
  return null;
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = resolveUrl(decodeURIComponent(req.url.split('?')[0]));
      if (!f || !f.startsWith(REPO)) { res.writeHead(404); return res.end('not found'); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.listen(Number(process.env.PORT) || 0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

module.exports = { serve };

if (require.main === module) serve().then((s) => console.log(s.base + '/games/repo3d/index.html'));
