/*
 * Trang design ở môi trường LIVE, chạy thật nhưng trỏ "LIVE" vào GameSpark DEV (dev-server EVENT_LIVE_TARGET=dev): trang đăng nhập
 * như một người chơi (js/gs-player.js, khoá client), đọc/ghi qua LIVE_CONFIG_*.
 *   1. người mới: hiện playerId, báo chưa có trong danh sách designer
 *   2. thêm playerId vào cd_live_config/_editors (khoá quản trị DEV, như chủ dự án làm) → sửa quests daily.pick, hộp xem lại hiện
 *      đúng ô cũ → mới, nút lưu khoá tới khi tick xác nhận, lưu xong DEV đổi; tab Lịch sử có dòng đúng người, đúng ô
 *   3. trả pick như cũ, gỡ khỏi danh sách
 *   4. gateway giả "chưa có event" (UNKNOWN_TYPE): trang báo "LIVE chưa có bản cloudcode hỗ trợ, cần snapshot"
 *
 *   node test/design-live-env.js        (tự mở dev-server ở cổng rảnh; cần ~/.hlo-gs/credentials và D:/REPO_Meta/tools/gs.mjs)
 */
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GS = process.env.GS_MJS || 'D:/REPO_Meta/tools/gs.mjs';
const SHOTS = process.env.SHOTS || path.join(require('os').tmpdir(), 'design-live-env');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const K = (id, p) => `[data-k="${id}|${p}"]`;

let fail = 0;
function check(name, ok, detail) {
  if (!ok) fail++;
  console.log((ok ? '✔ ' : '✘ ') + name + (detail ? ' — ' + detail : ''));
}
function gs(tool, args) {
  const out = execFileSync(process.execPath, [GS, 'json', tool, JSON.stringify(args)], { encoding: 'utf8', timeout: 120000 });
  return JSON.parse(out.slice(out.indexOf('{')));
}
const liveDoc = (id) => gs('gs_data_query', { collection: 'cd_live_config', filter: { _id: id } }).docs[0] || null;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const port = 18000 + Math.floor(Math.random() * 2000);
  const dev = spawn(process.execPath, [path.join(ROOT, 'supabase/functions/gs-design/dev-server.mjs')], {
    env: Object.assign({}, process.env, { PORT: String(port), EVENT_LIVE_TARGET: 'dev', ACTOR_LABEL: 'design-live-env' }), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok) => dev.stdout.once('data', ok));
  const API = 'http://127.0.0.1:' + port;
  const srv = http.createServer((rq, rs) => {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    fs.readFile(path.join(ROOT, u), (e, b) => {
      if (e) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); rs.end(b);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const PAGE = 'http://127.0.0.1:' + srv.address().port + '/design.html?env=live&api=' + encodeURIComponent(API);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', email: 'live@test', accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600e3 }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const editorsBefore = liveDoc('_editors');
  let playerId = '';
  let pickBefore = null;
  try {
    await p.goto(PAGE);
    await p.waitForFunction(() => { const e = document.getElementById('dz-live-player'); return e && /^player_/.test(e.textContent); }, null, { timeout: 60000 });
    playerId = await p.textContent('#dz-live-player');
    const chip = await p.textContent('#dz-live-allowed');
    check('LIVE: trang đăng nhập người chơi, hiện playerId', /^player_/.test(playerId), playerId);
    check('người mới: báo chưa có trong danh sách designer', /Chưa có trong danh sách designer/.test(chip), chip);
    const navItems = await p.$$eval('#dz-nav .dz-nav__item', (els) => els.map((e) => e.getAttribute('data-table')));
    check('LIVE chỉ hiện bảng chỉnh online + Lịch sử', navItems.indexOf('foes') < 0 && navItems.indexOf('cost_guard') < 0 && navItems.indexOf('quests') >= 0 && navItems.indexOf('history') >= 0, navItems.join(','));
    await p.screenshot({ path: path.join(SHOTS, '1-not-designer.png') });

    const list = ((editorsBefore && editorsBefore.editors) || []).concat([{ playerId, label: 'design-live-env' }]);
    if (editorsBefore) gs('gs_data_write', { op: 'update', collection: 'cd_live_config', filter: { _id: '_editors' }, set: { editors: list } });
    else gs('gs_data_write', { op: 'insert', collection: 'cd_live_config', doc: { _id: '_editors', editors: list } });

    await p.reload();
    await p.waitForFunction(() => /Designer: design-live-env/.test((document.getElementById('dz-live-allowed') || {}).textContent || ''), null, { timeout: 60000 });
    check('sau khi thêm vào _editors: trang báo Designer', true, await p.textContent('#dz-live-allowed'));
    const qBefore = liveDoc('quests');
    pickBefore = qBefore.rows.find((d) => d._id === 'daily').pick;

    const saveOnce = async (value) => {
      await p.click('#dz-nav [data-table="quests"]');
      await p.waitForSelector(K('daily', 'pick') + ' input');
      await p.fill(K('daily', 'pick') + ' input', String(value));
      await p.click('#btn-review');
      await p.waitForSelector('#dz-live-cells li', { timeout: 30000 });
      const cells = await p.$$eval('#dz-live-cells li', (els) => els.map((e) => e.textContent));
      const locked = await p.$eval('#btn-save', (e) => e.disabled);
      await p.check('#dz-live-confirm');
      const unlocked = await p.$eval('#btn-save', (e) => !e.disabled);
      await p.screenshot({ path: path.join(SHOTS, '2-review-' + value + '.png') });
      await p.click('#btn-save');
      await p.waitForFunction(() => /Đã lưu lên LIVE/.test(document.getElementById('dz-toasts').textContent), null, { timeout: 30000 });
      return { cells, locked, unlocked };
    };

    const up = await saveOnce(pickBefore + 1);
    check('hộp xem lại hiện đúng ô cũ → mới từ server', up.cells.length === 1 && up.cells[0] === 'daily.pick: ' + pickBefore + ' → ' + (pickBefore + 1), up.cells.join(' | '));
    check('nút lưu LIVE khoá tới khi tick xác nhận', up.locked && up.unlocked, JSON.stringify({ locked: up.locked, unlocked: up.unlocked }));
    const qAfter = liveDoc('quests');
    check('lưu thật: cd_live_config/quests daily.pick = ' + (pickBefore + 1), qAfter.rows.find((d) => d._id === 'daily').pick === pickBefore + 1, 'pick ' + qAfter.rows.find((d) => d._id === 'daily').pick);

    await p.click('#dz-nav [data-table="history"]');
    await p.waitForSelector('#dz-hist .dz-hist-row', { timeout: 30000 });
    const top = await p.$eval('#dz-hist .dz-hist-row', (e) => e.textContent);
    check('tab Lịch sử: dòng trên cùng đúng người và ô cũ → mới', top.indexOf(playerId) >= 0 && top.indexOf('design-live-env') >= 0 && top.indexOf('daily.pick: ' + pickBefore + ' → ' + (pickBefore + 1)) >= 0, top.slice(0, 200));
    await p.selectOption('#dz-hist-table', 'modes');
    await p.waitForFunction(() => !document.querySelector('.dz-loading'), null, { timeout: 30000 });
    const modesRows = await p.$$eval('#dz-hist .dz-hist-row', (els) => els.map((e) => e.textContent));
    check('lọc theo bảng modes: không có dòng quests', modesRows.every((t) => t.indexOf('daily.pick') < 0), modesRows.length + ' dòng');
    await p.screenshot({ path: path.join(SHOTS, '3-history.png'), fullPage: true });

    await saveOnce(pickBefore);
    check('trả pick như cũ', liveDoc('quests').rows.find((d) => d._id === 'daily').pick === pickBefore, 'pick ' + pickBefore);
    pickBefore = null;

    // LIVE chưa snapshot: gateway trả UNKNOWN_TYPE cho LIVE_CONFIG_*
    await p.route('**/rpc/**', async (route) => {
      const body = route.request().postData() || '';
      if (/"@t":"LIVE_CONFIG_/.test(body)) {
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ ok: false, error: { code: 'UNKNOWN_TYPE', message: 'không có lệnh LIVE_CONFIG_GET' } }) });
      } else await route.continue();
    });
    await p.reload();
    await p.waitForFunction(() => !document.getElementById('dz-banner').hidden, null, { timeout: 30000 });
    const banner = await p.textContent('#dz-banner');
    check('LIVE chưa có event: báo cần snapshot', /LIVE chưa có bản cloudcode hỗ trợ, cần snapshot/.test(banner), banner);
    await p.screenshot({ path: path.join(SHOTS, '4-no-event.png') });
    check('không có lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('chạy hết bài', false, e.message);
  } finally {
    if (pickBefore !== null) {
      const q = liveDoc('quests');
      q.rows.find((d) => d._id === 'daily').pick = pickBefore;
      gs('gs_data_write', { op: 'update', collection: 'cd_live_config', filter: { _id: 'quests' }, set: { rows: q.rows } });
    }
    if (editorsBefore) gs('gs_data_write', { op: 'update', collection: 'cd_live_config', filter: { _id: '_editors' }, set: { editors: editorsBefore.editors } });
    else gs('gs_data_write', { op: 'delete', collection: 'cd_live_config', filter: { _id: '_editors' } });
    await b.close(); srv.close(); dev.kill();
  }
  console.log('  ảnh: ' + SHOTS);
  console.log(fail ? 'KHÔNG ĐẠT' : 'ĐẠT');
  process.exit(fail ? 1 : 0);
})();
