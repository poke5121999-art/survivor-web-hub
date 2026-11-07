/*
 * Bộ kiểm cho trang sửa thông số game (game-config.html).
 * Chạy qua HTTP thật trên một máy chủ tĩnh, với Supabase REST GIẢ trong tiến trình
 * (GET/POST game_config, GET game_config_history) mô phỏng RLS: người không phải admin ghi bị 403.
 * Schema là bản mẫu thật ở games/pocket-auto-battler-pet/config.schema.json.
 * Chạy: node test/game-config-editor.js   (PW / SHOTS ghi đè đường dẫn máy tác giả)
 */
const PW = process.env.PW || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || 'C:/Users/tamph/AppData/Local/Temp/claude/d865edcd7eb97c4b/e9d84ff5-b1ad-44ec-851a-32eb14024c6e/scratchpad/shots-config';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const GAME = 'pocket-auto-battler-pet';
const clone = v => JSON.parse(JSON.stringify(v));

const SEED = { run: { hearts: 4 } };
const fake = {
  admin: true, missing: false, row: { game_id: GAME, data: clone(SEED), version: 1 },
  history: [{ id: 1, game_id: GAME, data: clone(SEED), version: 1, saved_at: '2026-11-01T03:00:00Z', saved_by: 'aaaaaaaa-0000' }],
  posts: [], nextId: 2,
  handle(method, url, body) {
    if (this.missing) return [404, { code: 'PGRST205', message: 'Could not find the table' }];
    if (url.pathname === '/rest/v1/game_config' && method === 'GET') return [200, this.row ? [clone(this.row)] : []];
    if (url.pathname === '/rest/v1/game_config' && method === 'POST') {
      this.posts.push(body);
      if (!this.admin) return [403, { code: '42501', message: 'new row violates row-level security policy for table "game_config"' }];
      const version = this.row ? this.row.version + 1 : 1;
      this.row = { game_id: body.game_id, data: clone(body.data), version };
      this.history.unshift({ id: this.nextId++, game_id: body.game_id, data: clone(body.data), version, saved_at: new Date().toISOString(), saved_by: 'bbbbbbbb-1111' });
      return [201, [clone(this.row)]];
    }
    if (url.pathname === '/rest/v1/game_config_history' && method === 'GET') {
      if (!this.admin) return [403, { code: '42501', message: 'permission denied' }];
      return [200, clone(this.history.slice(0, Number(url.searchParams.get('limit') || 20)))];
    }
    return [404, { message: 'lạ' }];
  },
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  - ' + detail : ''));
}

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rs) => {
      const url = new URL(req.url, 'http://x');
      const u = decodeURIComponent(url.pathname);
      if (u.startsWith('/rest/v1/')) {
        let b = ''; req.on('data', c => b += c);
        req.on('end', () => {
          const [st, j] = fake.handle(req.method, url, b ? JSON.parse(b) : undefined);
          rs.writeHead(st, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(j));
        });
        return;
      }
      if (u === '/js/supabase-config.js') {
        rs.writeHead(200, { 'Content-Type': 'text/javascript' });
        rs.end(`window.SUPABASE_CONFIG = { url: "http://${req.headers.host}", anonKey: "anon-test" };`); return;
      }
      fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, b) => {
        if (e) { rs.writeHead(404); rs.end('no'); return; }
        rs.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); rs.end(b);
      });
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', email: 't@x', accessToken: 'tok',
      refreshToken: 'r', expiresAt: Date.now() + 3600e3 }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/status of (403|404)/.test(m.text())) errs.push('CONSOLE ' + m.text()); });

  const tab = async id => { await p.click(`#dz-nav [data-tab="${id}"]`); await p.waitForTimeout(50); };
  const input = k => `[data-k="${k}"] input`;
  const type = async (sel, v) => { await p.fill(sel, v); };
  const keysIn = o => { const out = []; (function w(x, pre) { Object.keys(x).forEach(k => {
    const v = x[k], kk = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) w(v, kk); else out.push(kk); }); })(o, ''); return out.sort(); };

  // 1) nạp
  await p.goto(BASE + '/game-config.html');
  await p.waitForSelector('.dz-pane__head');
  check('tiêu đề game', /pocket-auto-battler-pet/.test(await p.textContent('#gc-title')));
  check('6 tab + Lịch sử', await p.$$eval('#dz-nav .dz-nav__item', e => e.length) === 7);
  check('ô đang ghi đè (hearts=4) được tô + có huy hiệu',
    await p.$eval('[data-field="run.hearts"]', e => e.querySelector('.gc-cell').classList.contains('is-override') && !e.querySelector('.gc-badge').hidden));
  check('giá trị ghi đè hiện trong ô', await p.inputValue(input('run.hearts')) === '4');
  check('hiện số mặc định', /mặc định: 3/.test(await p.textContent('[data-field="run.hearts"] .gc-def')));
  check('thanh dưới ẩn khi chưa sửa', await p.$eval('#dz-bar', e => e.hidden));
  await p.screenshot({ path: path.join(SHOTS, '01-load.png') });

  // 2) sửa 3 ô ở 3 tab (reward, gacha, run)
  await type(input('run.startGold'), '700');
  await tab('gacha'); await type(input('gacha.pullCost'), '160');
  await tab('reward');
  await type('[data-k="reward.fights"] tr[data-row="2"] [data-col="gold"] input', '150');
  check('thanh dưới đếm 3 thay đổi', /^3 thay đổi/.test(await p.textContent('#dz-bar-count')));
  check('chấm đánh dấu ở tab đã sửa', await p.$eval('#dz-nav [data-tab="gacha"] .dz-dot', e => !e.hidden)
    && await p.$eval('#dz-nav [data-tab="shop"] .dz-dot', e => e.hidden));
  await p.screenshot({ path: path.join(SHOTS, '02-edited-table.png') });

  // 2b) kiểm tra: nhập sai chặn lưu
  await tab('run'); await type(input('run.startGold'), 'abc');
  check('nhập chữ vào ô số: hiện lỗi', /Không phải số/.test(await p.textContent('[data-field="run.startGold"] .dz-cell__err')));
  await p.click('#btn-review'); await p.waitForTimeout(100);
  check('có ô sai thì không mở hộp thoại', !(await p.$eval('#dz-dialog', e => e.open)));
  await type(input('run.startGold'), '700.5');
  check('số lẻ ở ô int bị từ chối', /số nguyên/.test(await p.textContent('[data-field="run.startGold"] .dz-cell__err')));
  await type(input('run.startGold'), '999999');
  check('vượt max bị từ chối', /tối đa 100000/.test(await p.textContent('[data-field="run.startGold"] .dz-cell__err')));
  await type(input('run.startGold'), '700');

  // 3) xem lại: đúng 3 mục
  await p.click('#btn-review'); await p.waitForSelector('#dz-dialog[open]');
  const items = await p.$$eval('#dz-dialog .dz-changes li', l => l.map(e => e.dataset.k).sort());
  check('hộp thoại liệt kê đúng 3 khoá', JSON.stringify(items) === JSON.stringify(['gacha.pullCost', 'reward.fights', 'run.startGold']), items.join(','));
  check('hộp thoại hiện số cũ → mới', /500/.test(await p.textContent('#dz-dialog [data-k="run.startGold"]')) && /700/.test(await p.textContent('#dz-dialog [data-k="run.startGold"]')));
  await p.screenshot({ path: path.join(SHOTS, '03-review-dialog.png') });

  // 4) lưu: một POST, lồng nhau, chỉ khoá đã sửa (+ ghi đè có sẵn hearts)
  await p.click('#gc-confirm'); await p.waitForFunction(() => !document.getElementById('dz-dialog').open);
  check('đã POST đúng 1 lần', fake.posts.length === 1);
  const sent = fake.posts[0] || { data: {} };
  check('body là đối tượng lồng nhau', sent.game_id === GAME && sent.data.run && sent.data.gacha && Array.isArray(sent.data.reward.fights));
  check('chỉ có các khoá đã sửa + ghi đè cũ', JSON.stringify(keysIn(sent.data)) === JSON.stringify(['gacha.pullCost', 'reward.fights', 'run.hearts', 'run.startGold']), keysIn(sent.data).join(','));
  check('giá trị đúng', sent.data.run.startGold === 700 && sent.data.run.hearts === 4 && sent.data.gacha.pullCost === 160 && sent.data.reward.fights[2].gold === 150 && sent.data.reward.fights[2].type === 'gym');
  check('sau lưu: thanh dưới ẩn, ô startGold thành ghi đè', await p.$eval('#dz-bar', e => e.hidden)
    && await p.$eval('[data-field="run.startGold"] .gc-cell', e => e.classList.contains('is-override')));

  // 5) về mặc định
  check('nút về mặc định hiện ở ô đã ghi đè', await p.$eval('[data-field="run.startGold"] .gc-reset', e => !e.hidden));
  await p.click('[data-field="run.startGold"] .gc-reset');
  check('về mặc định: ô trả về 500, chờ lưu', await p.inputValue(input('run.startGold')) === '500' && /^1 thay đổi/.test(await p.textContent('#dz-bar-count')));
  await p.click('#btn-review'); await p.waitForSelector('#dz-dialog[open]');
  check('hộp thoại nói bỏ ghi đè', /bỏ ghi đè/.test(await p.textContent('#dz-dialog [data-k="run.startGold"]')));
  await p.click('#gc-confirm'); await p.waitForFunction(() => !document.getElementById('dz-dialog').open);
  const after = fake.row.data;
  check('lưu xong khoá bị gỡ, khoá khác còn', after.run.startGold === undefined && after.run.hearts === 4 && after.gacha.pullCost === 160, JSON.stringify(keysIn(after)));
  check('Huỷ thay đổi trả ô về giá trị đang lưu', await (async () => {
    await p.fill(input('run.hearts'), '6');
    await p.click('#btn-discard');
    return await p.inputValue(input('run.hearts')) === '4' && await p.$eval('#dz-bar', e => e.hidden);
  })());

  // 6) không phải admin: 403 → lỗi tiếng Việt
  fake.admin = false;
  await p.fill(input('run.hearts'), '5');
  await p.click('#btn-review'); await p.waitForSelector('#dz-dialog[open]');
  await p.click('#gc-confirm'); await p.waitForSelector('#dz-dialog .dz-dialog__status.is-error');
  const msg = await p.textContent('#dz-dialog .dz-dialog__status');
  check('403 hiện "không phải admin nên không lưu được"', /không phải admin nên không lưu được/.test(msg), msg);
  check('403 không đổi dữ liệu đã lưu', fake.row.data.run.hearts === 4);
  await p.screenshot({ path: path.join(SHOTS, '04-non-admin-403.png') });
  await p.click('#gc-cancel'); await p.click('#btn-discard');
  await tab('history'); await p.waitForSelector('#dz-pane .dz-cell__err');
  check('lịch sử với người thường: báo không xem được', /không phải admin nên không xem được lịch sử/.test(await p.textContent('#dz-pane .dz-cell__err')));
  fake.admin = true;

  // 7) lịch sử + khôi phục
  await tab('run'); await tab('history'); await p.waitForSelector('.gc-hist li');
  const n = await p.$$eval('.gc-hist li', l => l.length);
  check('lịch sử liệt kê các lần lưu (seed + 2 lần lưu)', n === 3, 'n=' + n);
  await p.screenshot({ path: path.join(SHOTS, '05-history.png') });
  await p.click('.gc-hist li[data-hid="1"] [data-act="restore"]'); await p.waitForSelector('#dz-dialog[open]');
  await p.click('#gc-confirm'); await p.waitForFunction(() => !document.getElementById('dz-dialog').open);
  check('khôi phục bản 1 ghi lại dữ liệu cũ', JSON.stringify(fake.row.data) === JSON.stringify(SEED), JSON.stringify(fake.row.data));
  await p.waitForFunction(() => document.querySelectorAll('.gc-hist li').length === 4);
  check('khôi phục tự thành một dòng lịch sử mới', true);
  await tab('gacha');
  check('sau khôi phục: gacha về mặc định 150', await p.inputValue(input('gacha.pullCost')) === '150');

  // 8) thiếu bảng
  fake.missing = true;
  await p.goto(BASE + '/game-config.html');
  await p.waitForSelector('#dz-banner:not([hidden])');
  check('thiếu bảng: chỉ cách chạy db/game-config.sql', /chạy db\/game-config\.sql/.test(await p.textContent('#dz-banner')));
  await p.screenshot({ path: path.join(SHOTS, '06-missing-table.png') });
  fake.missing = false;

  // 9) game lạ
  await p.goto(BASE + '/game-config.html?game=khong-co');
  await p.waitForSelector('#dz-banner:not([hidden])');
  check('game không có schema: báo rõ file thiếu', /games\/khong-co\/config\.schema\.json/.test(await p.textContent('#dz-banner')));

  check('không có lỗi JS/console', errs.length === 0, errs.join(' | '));
  await b.close(); srv.close();
  console.log(`\n${pass} đạt, ${fail} trượt`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
