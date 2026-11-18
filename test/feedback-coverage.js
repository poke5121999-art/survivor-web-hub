/*
 * Mọi thẻ game trên hub có phím báo lỗi F9 không: tải trang đích của từng thẻ (data/games.js, status "available")
 * trên Pages và tìm thẻ <script> nạp game-gate.js (tự nạp kit) hoặc feedback-capture.js. Không mở trình duyệt.
 * Trang chỉ chuyển hướng (games/<id>/index.html của game đã dời sang hub-games) thì theo URL trong data/games.js.
 *
 * Dùng:  node test/feedback-coverage.js        (BASE=... để đổi gốc hub)
 * Thẻ trong NO_KIT là repo riêng đang có agent khác làm; F9 ở đó cần chủ repo nhúng kit (xem brain/codebase/feedback-capture-f9.md).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = (process.env.BASE || 'https://poke5121999-art.github.io/survivor-web-hub').replace(/\/+$/, '');
const NO_KIT = { 'walking-trade-bevy': 'repo twt-bevy-web, không đụng', 'walking-trade-proc': 'repo twt-proc-web, agent twt-proc đang làm' };

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'games.js'), 'utf8'), ctx);
const games = ctx.window.HUB_GAMES.filter((g) => g.status === 'available');

(async () => {
  let pass = 0, fail = 0, known = 0;
  for (const g of games) {
    const url = /^https?:/.test(g.path) ? g.path : BASE + '/' + g.path;
    let how = null, err = null;
    try {
      const html = await (await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'nc=' + Date.now(), { signal: AbortSignal.timeout(30000) })).text();
      if (/<script[^>]+src="[^"]*feedback-capture\.js[^"]*"/.test(html)) how = 'kit';
      else if (/<script[^>]+src="[^"]*game-gate\.js[^"]*"/.test(html)) how = 'gate';
    } catch (e) { err = e.message; }
    if (how) { pass++; console.log('  PASS ' + g.id + '  ' + how); }
    else if (NO_KIT[g.id]) { known++; console.log('  SKIP ' + g.id + '  không có kit: ' + NO_KIT[g.id]); }
    else { fail++; console.log('  FAIL ' + g.id + '  không nạp game-gate.js hay feedback-capture.js  ' + url + (err ? '  (' + err + ')' : '')); }
  }
  console.log(`\n${pass}/${games.length} thẻ có F9, ${known} thẻ biết là thiếu, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
