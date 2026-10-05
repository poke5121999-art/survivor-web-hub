/*
 * Kiểm trang design.html trên GameSpark DEV THẬT, qua dev-server của proxy (cùng core.js với bản Supabase).
 * GHI THẬT một lần rồi hoàn lại: quests/daily.pick → giá trị hiện tại + 1 → về lại như cũ.
 *
 *   node supabase/functions/gs-design/dev-server.mjs   (cửa sổ khác, cổng 8787)
 *   node test/design-live.js
 */
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API = 'http://127.0.0.1:8787';
const SHOTS = process.env.SHOTS || path.join(require('os').tmpdir(), 'design-live');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

let fail = 0;
function check(name, ok, detail) {
  if (!ok) fail++;
  console.log((ok ? '✔ ' : '✘ ') + name + (detail ? ' — ' + detail : ''));
}

async function api(body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

const K = (id, p) => `[data-k="${id}|${p}"]`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = http.createServer((rq, rs) => {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    fs.readFile(path.join(ROOT, u), (e, b) => {
      if (e) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); rs.end(b);
    });
  }).listen(8794);

  const before = (await api({ action: 'get', table: 'quests' })).docs.find(d => d._id === 'daily').pick;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', email: 'live@test', accessToken: 'tok',
      refreshToken: 'r', expiresAt: Date.now() + 3600e3 }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  const open = async n => {
    await p.click(`#dz-nav [data-table="${n}"]`);
    await p.waitForSelector('.dz-pane__head');
    await p.waitForTimeout(300);
  };
  const saveAndWait = async () => {
    await p.click('#btn-review');
    await p.waitForFunction(() => /GameSpark báo/.test(document.getElementById('dz-dry').textContent), null, { timeout: 30000 });
    const dry = await p.$eval('#dz-dry', e => e.textContent.trim());
    const list = await p.$$eval('#dz-changes li', els => els.map(e => e.textContent.trim()));
    await p.click('#btn-save');
    await p.waitForFunction(() => document.getElementById('dz-bar').hidden, null, { timeout: 30000 });
    return { dry, list };
  };

  await p.goto('http://127.0.0.1:8794/design.html?api=' + encodeURIComponent(API));
  await p.waitForSelector('#dz-nav .dz-chip--live', { timeout: 60000 });
  const chipQ = await p.$eval('#dz-nav [data-table="quests"] .dz-chip', e => e.textContent.trim());
  check('quests trên DEV hiện "Trên GameSpark"', chipQ === 'Trên GameSpark', chipQ);
  const missing = await p.$$eval('#dz-nav .dz-chip', els => els.filter(e => /Chưa dán/.test(e.textContent)).length);
  console.log('  bảng chưa dán trên DEV: ' + missing + '/30');

  for (const n of ['wallet_start', 'foes', 'run_timers', 'stage_houses']) {
    await open(n);
    await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false });
  }

  await open('quests');
  const shown = await p.inputValue(K('daily', 'pick') + ' input');
  check('trang hiện đúng pick đang có trên DEV', shown === String(before), `trang ${shown}, DEV ${before}`);

  await p.fill(K('daily', 'pick') + ' input', String(before + 1));
  const up = await saveAndWait();
  console.log('  xem lại: ' + up.list.join(' | ') + ' · ' + up.dry);
  const after = (await api({ action: 'get', table: 'quests' })).docs.find(d => d._id === 'daily').pick;
  check('lưu thật: DEV đổi pick thành ' + (before + 1), after === before + 1, 'DEV ' + after);
  await p.screenshot({ path: path.join(SHOTS, 'quests-saved.png') });

  await p.fill(K('daily', 'pick') + ' input', String(before));
  await saveAndWait();
  const restored = (await api({ action: 'get', table: 'quests' })).docs.find(d => d._id === 'daily').pick;
  check('hoàn lại: DEV về pick ' + before, restored === before, 'DEV ' + restored);

  check('không có lỗi console', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('  ảnh: ' + SHOTS);
  await b.close(); srv.close();
  console.log(fail ? 'KHÔNG ĐẠT' : 'ĐẠT');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('✘ ' + e.message); process.exit(1); });
