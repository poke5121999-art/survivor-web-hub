/*
 * Kiểm feedback.html với Supabase giả trong bộ nhớ (page.route), bấm bằng chuột/phím thật.
 * Dùng:  node test/feedback-ui.js       Ảnh chụp: FB_SHOTS=<thư mục>.
 *        FB_URL=<gốc hub> để chạy trên Pages; mặc định tự dựng server tĩnh từ repo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const SHOTS = process.env.FB_SHOTS;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

function seed() {
  const t = (id, game_id, kind, title, status, resolution) => ({
    id, game_id, kind, title, body: 'Mô tả phiếu ' + id, status, resolution: resolution || null,
    reporter_name: 'An', created_at: '2026-10-0' + (id % 9 + 1) + 'T08:00:00Z'
  });
  return [
    t(1, 'dredge', 'bug', 'Thuyền kẹt ở bãi đá', 'closed', 'Sửa ở 77d1f71: va chạm đá dùng hộp nhỏ hơn'),
    t(2, 'dredge', 'feedback', 'Thêm nút tắt nhạc', 'open'),
    t(3, 'hic', 'bug', 'Rơi khung hình ở màn 3', 'doing'),
    t(4, 'dredge', 'bug', 'Không lặp lại được', 'wontfix', 'Không tái hiện được trên Chrome 130')
  ];
}

async function open(br, base, opts) {
  const ctx = await br.newContext({ viewport: opts.viewport, colorScheme: opts.scheme || 'dark' });
  if (opts.session) await ctx.addInitScript((s) => localStorage.setItem('hub.session.v1', JSON.stringify(s)), opts.session);
  const page = await ctx.newPage();
  const db = { rows: seed(), posts: [], auth: [] };
  await page.route('**/rest/v1/hub_feedback**', async (route) => {
    const req = route.request();
    db.auth.push(req.headers().authorization);
    if (opts.missing) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: 'no table' }) });
    if (req.method() === 'POST') {
      const row = JSON.parse(req.postData());
      db.posts.push(row);
      const saved = Object.assign({ id: db.rows.length + 1, status: 'open', resolution: null, created_at: new Date().toISOString() }, row);
      db.rows.push(saved);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([saved]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(db.rows.slice().reverse()) });
  });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(base + '/feedback.html' + (opts.query || ''), { waitUntil: 'networkidle' });
  return { ctx, page, db, problems };
}

const titles = (page) => page.$$eval('#fb-items .fb-item__title', (n) => n.map((x) => x.textContent));
const tabs = (page) => page.$$eval('#fb-tabs .fb-tab', (n) => n.map((x) => x.textContent));

(async () => {
  const { chromium } = require(PW);
  const srv = process.env.FB_URL ? { base: process.env.FB_URL.replace(/\/+$/, ''), close() {} } : await serve();
  const br = await chromium.launch();
  try {
    console.log('desktop 1280x800, khách, ?game=dredge');
    let s = await open(br, srv.base, { viewport: { width: 1280, height: 800 }, query: '?game=dredge', session: { kind: 'guest', name: 'Khách' } });
    let { page } = s;
    check('?game=dredge chọn sẵn game', await page.inputValue('#fb-game') === 'dredge');
    check('ô chọn game có trang hub + game available', await page.$$eval('#fb-game option', (o) => o[0].value === 'hub' && o.length > 5), await page.$$eval('#fb-game option', (o) => o.length));
    check('tab Đang mở chỉ hiện phiếu mở của dredge', JSON.stringify(await titles(page)) === JSON.stringify(['Thêm nút tắt nhạc']), JSON.stringify(await titles(page)));
    check('đếm trên tab đúng', JSON.stringify(await tabs(page)) === JSON.stringify(['Đang mở · 1', 'Đã đóng · 2', 'Tất cả · 3']), JSON.stringify(await tabs(page)));

    await page.click('#fb-tabs .fb-tab:nth-child(2)');
    const res = await page.$$eval('#fb-items .fb-item__res', (n) => n.map((x) => x.textContent));
    check('tab Đã đóng hiện ghi chú kết quả', res.length === 2 && /77d1f71/.test(res[1] + res[0]), JSON.stringify(res));

    await page.click('#fb-all-games');
    await page.click('#fb-tabs .fb-tab:nth-child(1)');
    check('Mọi game gộp phiếu của game khác', (await titles(page)).includes('Rơi khung hình ở màn 3'), JSON.stringify(await titles(page)));
    await page.click('#fb-all-games');

    await page.click('#fb-submit');
    check('tiêu đề trống bị chặn, không gọi mạng', s.db.posts.length === 0 && /ít nhất 3/.test(await page.textContent('#fb-msg')));

    await page.click('.fb-kind label:nth-child(1)');
    await page.click('#fb-title');
    await page.keyboard.type('<img src=x onerror=alert(1)> cá mập xuyên tường');
    await page.click('#fb-body');
    await page.keyboard.type('Bơi sát tường phía bắc thì cá mập đi xuyên qua.');
    await page.click('#fb-submit');
    await page.waitForFunction(() => /Đã gửi phiếu #5/.test(document.getElementById('fb-msg').textContent));
    const post = s.db.posts[0] || {};
    check('gửi đúng dữ liệu', post.game_id === 'dredge' && post.kind === 'bug' && /cá mập xuyên tường$/.test(post.title) && post.reporter_name === null && /x/.test(post.env.screen), JSON.stringify(post));
    check('khách gửi bằng anon key', /^Bearer eyJ/.test(s.db.auth[s.db.auth.length - 1]));
    check('phiếu mới hiện đầu danh sách', (await titles(page))[0] === post.title);
    check('tiêu đề hiện dạng chữ, không thành thẻ img', await page.$$eval('#fb-items img', (n) => n.length) === 0);
    check('ô nhập được xoá sau khi gửi', await page.inputValue('#fb-title') === '');
    const sx = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check('không cuộn ngang', sx);
    check('không lỗi trang', !s.problems.length, s.problems.join(' | '));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-desktop.png'), fullPage: true });
    await s.ctx.close();

    console.log('điện thoại 390x844, thành viên, nền sáng');
    s = await open(br, srv.base, {
      viewport: { width: 390, height: 844 }, scheme: 'light',
      session: { kind: 'member', name: 'Bình', accessToken: 'member-jwt', expiresAt: Date.now() + 3600e3 }
    });
    page = s.page;
    check('tên thành viên điền sẵn', await page.inputValue('#fb-name') === 'Bình');
    await page.selectOption('#fb-game', 'hic');
    check('đổi game lọc lại danh sách', JSON.stringify(await titles(page)) === JSON.stringify(['Rơi khung hình ở màn 3']));
    await page.click('.fb-kind label:nth-child(2)');
    check('chọn Góp ý đổi gợi ý ô chi tiết', /thêm, bớt/.test(await page.getAttribute('#fb-body', 'placeholder')));
    await page.click('#fb-title');
    await page.keyboard.type('Cho chọn độ khó');
    await page.click('#fb-submit');
    await page.waitForFunction(() => /Đã gửi phiếu/.test(document.getElementById('fb-msg').textContent));
    check('thành viên gửi bằng JWT của mình', s.db.auth[s.db.auth.length - 1] === 'Bearer member-jwt');
    check('gửi kind feedback cho hic', s.db.posts[0].kind === 'feedback' && s.db.posts[0].game_id === 'hic' && s.db.posts[0].reporter_name === 'Bình');
    check('không cuộn ngang ở 390px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check('không lỗi trang', !s.problems.length, s.problems.join(' | '));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-phone.png'), fullPage: true });
    await s.ctx.close();

    console.log('bảng chưa cài');
    s = await open(br, srv.base, { viewport: { width: 1280, height: 800 }, missing: true });
    page = s.page;
    check('báo hộp thư chưa mở', /db\/feedback\.sql/.test(await page.textContent('#fb-banner')) && await page.isVisible('#fb-banner'));
    check('nút gửi bị khoá', await page.isDisabled('#fb-submit'));
    await s.ctx.close();

    console.log('hub có lối vào trang phiếu');
    const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'guest', name: 'Khách' })));
    const hub = await ctx.newPage();
    await hub.goto(srv.base + '/index.html', { waitUntil: 'networkidle' });
    await hub.click('.hub-feedback-link');
    await hub.waitForURL(/feedback\.html/);
    check('bấm nút ở đầu hub mở feedback.html', true);
    if (SHOTS) {
      await hub.goto(srv.base + '/index.html', { waitUntil: 'networkidle' });
      await hub.screenshot({ path: path.join(SHOTS, 'hub-header.png'), clip: { x: 0, y: 0, width: 1280, height: 140 } });
    }
    await ctx.close();
  } finally {
    await br.close();
    srv.close();
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
