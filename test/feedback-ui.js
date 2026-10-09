/*
 * Kiểm feedback.html và feedback-admin.html với Supabase giả trong bộ nhớ (page.route), bấm bằng chuột/phím thật.
 * Dùng:  node test/feedback-ui.js       Ảnh chụp: FB_SHOTS=<thư mục>.
 *        FB_URL=<gốc hub> để chạy trên Pages; mặc định tự dựng server tĩnh từ repo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const SHOTS = process.env.FB_SHOTS;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const KEY = 'good-key';
const ADMIN = { kind: 'member', name: 'Poke', email: 'poke5121999@gmail.com', accessToken: 'admin-jwt', refreshToken: 'r', expiresAt: Date.now() + 3600e3 };
const PLAYER = { kind: 'member', name: 'Bình', email: 'binh@example.com', accessToken: 'member-jwt', refreshToken: 'r', expiresAt: Date.now() + 3600e3 };
const SHOT_RE = /^[a-z0-9-]{1,40}\/[0-9a-f-]{36}\.(webp|jpg)$/;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set([x % 256, 120, 200], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const BIG = png(3000, 2000);
const SMALL = png(64, 48);

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
  const t = (id, game_id, kind, title, status, resolution, shots) => ({
    id, game_id, kind, title, body: 'Mô tả phiếu ' + id, status, resolution: resolution || null, shots: shots || [],
    reporter_name: 'An', env: { screen: '390x844@3', rev: '20261001a', lang: 'vi' },
    created_at: '2026-10-0' + (id % 9 + 1) + 'T08:00:00Z', updated_at: '2026-10-09T08:00:00Z'
  });
  return [
    t(1, 'dredge', 'bug', 'Thuyền kẹt ở bãi đá', 'closed', 'Sửa ở 77d1f71: va chạm đá dùng hộp nhỏ hơn'),
    t(2, 'dredge', 'feedback', 'Thêm nút tắt nhạc', 'open'),
    t(3, 'hic', 'bug', 'Rơi khung hình ở màn 3', 'doing', null, ['hic/0f8c2a8e-1b2c-4d5e-8f90-123456789abc.webp']),
    t(4, 'dredge', 'bug', 'Không lặp lại được', 'wontfix', 'Không tái hiện được trên Chrome 130'),
    t(5, 'repo2d-unity', 'bug', 'Kẹt cửa thang máy', 'open')
  ];
}

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(br, base, file, opts) {
  const ctx = await br.newContext({ viewport: opts.viewport, colorScheme: opts.scheme || 'dark' });
  const seedStorage = ([k, v]) => { if (location.protocol.startsWith('http')) localStorage.setItem(k, v); };
  if (opts.session) await ctx.addInitScript(seedStorage, ['hub.session.v1', JSON.stringify(opts.session)]);
  if (opts.adminKey) await ctx.addInitScript(seedStorage, ['hub.feedback.key', opts.adminKey]);
  const page = await ctx.newPage();
  const db = opts.db || { rows: seed(), posts: [], uploads: [], auth: [], rpc: [] };
  await page.route('**/rest/v1/hub_feedback**', async (route) => {
    const req = route.request();
    db.auth.push(req.headers().authorization);
    if (opts.missing) return json(route, 404, { code: 'PGRST205', message: 'no table' });
    if (req.method() === 'POST') {
      const row = JSON.parse(req.postData());
      db.posts.push(row);
      const now = new Date().toISOString();
      const saved = Object.assign({ id: Math.max(...db.rows.map((r) => r.id)) + 1, status: 'open', resolution: null, created_at: now, updated_at: now }, row);
      db.rows.push(saved);
      return json(route, 201, [saved]);
    }
    return json(route, 200, db.rows.slice().reverse());
  });
  await page.route('**/auth/v1/token**', (route) => json(route, 200, {
    access_token: 'admin-jwt', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1', email: ADMIN.email, user_metadata: { display_name: 'Poke' } }
  }));
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = route.request().url().split('/rpc/')[1];
    const a = JSON.parse(route.request().postData());
    const allowed = a.p_key === KEY || route.request().headers().authorization === 'Bearer admin-jwt';
    db.rpc.push([name, a, route.request().headers().authorization]);
    if (name === 'fb_can_manage') return json(route, 200, allowed);
    if (!allowed) return json(route, 401, { code: '42501', message: 'feedback manage denied' });
    const row = db.rows.find((r) => r.id === a.p_id);
    if (name === 'fb_delete') { db.rows = db.rows.filter((r) => r !== row); return route.fulfill({ status: 204 }); }
    Object.assign(row, { status: a.p_status, resolution: a.p_resolution, updated_at: new Date().toISOString() });
    return json(route, 200, row);
  });
  await page.route('**/storage/v1/object/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      db.uploads.push({ path: req.url().split('/object/hub-feedback/')[1], type: req.headers()['content-type'], size: req.postDataBuffer().length });
      return json(route, 200, { Key: 'ok' });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: SMALL });
  });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/40[14]/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(base + '/' + file + (opts.query || ''), { waitUntil: 'networkidle' });
  return { ctx, page, db, problems };
}

const titles = (page) => page.$$eval('.fb-items .fb-item__title', (n) => n.map((x) => x.textContent));
const tabs = (page) => page.$$eval('#fb-tabs .fb-tab', (n) => n.map((x) => x.textContent));
const pasteImage = (page, w, h) => page.evaluate(([w, h]) => new Promise((resolve) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').fillRect(0, 0, w, h);
  c.toBlob((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([b], 'paste.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    resolve();
  }, 'image/png');
}), [w, h]);

async function reportPage(br, base) {
  console.log('feedback.html · desktop 1280x800, khách, chưa chọn gì');
  let s = await open(br, base, 'feedback.html', { viewport: { width: 1280, height: 800 }, session: { kind: 'guest', name: 'Khách' } });
  let { page } = s;
  check('mặc định tiếng Anh', await page.textContent('h1') === 'Bug reports & feedback' && await page.getAttribute('html', 'lang') === 'en');
  check('mặc định chọn REPO Unity (repo2d-unity)', await page.inputValue('#fb-game') === 'repo2d-unity');
  check('danh sách lọc theo game mặc định', JSON.stringify(await titles(page)) === JSON.stringify(['Kẹt cửa thang máy']), JSON.stringify(await titles(page)));

  await page.goto('about:blank');
  await page.goto(base + '/feedback.html?game=dredge', { waitUntil: 'networkidle' });
  check('?game=dredge chọn sẵn game', await page.inputValue('#fb-game') === 'dredge');
  check('đếm trên tab đúng', JSON.stringify(await tabs(page)) === JSON.stringify(['Open · 1', 'Closed · 2', 'All · 3']), JSON.stringify(await tabs(page)));
  await page.click('#fb-tabs .fb-tab:nth-child(2)');
  const res = await page.$$eval('#fb-items .fb-item__res', (n) => n.map((x) => x.textContent).join('|'));
  check('tab Closed hiện ghi chú kết quả', /77d1f71/.test(res) && /Chrome 130/.test(res), res);
  await page.click('#fb-tabs .fb-tab:nth-child(1)');

  await page.click('#fb-submit');
  check('tiêu đề trống bị chặn, không gọi mạng', s.db.posts.length === 0 && /at least 3/.test(await page.textContent('#fb-msg')));

  await page.setInputFiles('#fb-shot-input', [{ name: 'big.png', mimeType: 'image/png', buffer: BIG }, { name: 'b.png', mimeType: 'image/png', buffer: SMALL }]);
  await page.waitForFunction(() => document.querySelectorAll('.fb-shot').length === 2);
  const dims = await page.$$eval('.fb-shot img', (n) => n.map((i) => Math.max(i.naturalWidth, i.naturalHeight)));
  check('ảnh 3000x2000 được thu còn ≤1600px', dims[0] === 1600 && dims[1] === 64, JSON.stringify(dims));
  await pasteImage(page, 300, 200);
  await page.waitForFunction(() => document.querySelectorAll('.fb-shot').length === 3);
  check('dán ảnh bằng Ctrl+V thêm được ảnh', true);
  check('đủ 3 ảnh thì ẩn nút thêm', await page.isHidden('#fb-shot-add'));
  await pasteImage(page, 50, 50);
  await page.waitForTimeout(300);
  check('ảnh thứ 4 bị từ chối kèm thông báo', await page.$$eval('.fb-shot', (n) => n.length) === 3 && /Up to 3/.test(await page.textContent('#fb-msg')));
  await page.click('.fb-shot:nth-child(2) .fb-shot__x');
  check('bấm × bỏ được một ảnh', await page.$$eval('.fb-shot', (n) => n.length) === 2 && await page.isVisible('#fb-shot-add'));

  await page.click('.fb-kind label:nth-child(1)');
  await page.click('#fb-title');
  await page.keyboard.type('<img src=x onerror=alert(1)> shark goes through wall');
  await page.click('#fb-body');
  await page.keyboard.type('Swim along the north wall.');
  await page.click('#fb-submit');
  await page.waitForFunction(() => /Report #6 sent/.test(document.getElementById('fb-msg').textContent));
  const post = s.db.posts[0] || {};
  check('tải 2 ảnh trước khi gửi phiếu', s.db.uploads.length === 2 && s.db.uploads.every((u) => SHOT_RE.test(u.path) && /^image\/(webp|jpeg)$/.test(u.type) && u.size < 1572864), JSON.stringify(s.db.uploads));
  check('phiếu mang đúng đường dẫn ảnh', JSON.stringify(post.shots) === JSON.stringify(s.db.uploads.map((u) => u.path)), JSON.stringify(post.shots));
  check('gửi đúng dữ liệu', post.game_id === 'dredge' && post.kind === 'bug' && /through wall$/.test(post.title) && post.reporter_name === null && post.env.lang === 'en', JSON.stringify(post));
  check('khách gửi bằng anon key', /^Bearer eyJ/.test(s.db.auth[s.db.auth.length - 1]));
  check('phiếu mới hiện đầu danh sách', (await titles(page))[0] === post.title);
  check('tiêu đề hiện dạng chữ, không thành thẻ img', await page.$$eval('#fb-items .fb-item__title img', (n) => n.length) === 0);
  check('ô nhập và ảnh được xoá sau khi gửi', await page.inputValue('#fb-title') === '' && await page.$$eval('.fb-shot', (n) => n.length) === 0);
  await page.click('#fb-items .fb-item:first-child summary');
  const shotSrc = await page.$$eval('#fb-items .fb-item:first-child .fb-item__shots img', (n) => n.map((i) => i.src));
  check('phiếu mở ra hiện ảnh từ URL public', shotSrc.length === 2 && shotSrc.every((u) => /\/storage\/v1\/object\/public\/hub-feedback\//.test(u)), JSON.stringify(shotSrc));

  await page.click('#fb-lang [data-lang="vi"]');
  check('bấm VI đổi chữ sang tiếng Việt', await page.textContent('h1') === 'Báo lỗi & góp ý' && /Đã gửi phiếu #6/.test(await page.textContent('#fb-msg')) && await page.getAttribute('html', 'lang') === 'vi');
  check('không cuộn ngang', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('không lỗi trang', !s.problems.length, s.problems.join(' | '));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-desktop.png'), fullPage: true });
  await page.goto('about:blank');
  await page.goto(base + '/feedback.html', { waitUntil: 'networkidle' });
  check('tải lại vẫn nhớ tiếng Việt và game đã chọn', await page.textContent('h1') === 'Báo lỗi & góp ý' && await page.inputValue('#fb-game') === 'dredge');
  await s.ctx.close();

  console.log('feedback.html · điện thoại 390x844, thành viên, nền sáng, ?lang=vi');
  s = await open(br, base, 'feedback.html', {
    viewport: { width: 390, height: 844 }, scheme: 'light', query: '?lang=vi',
    session: { kind: 'member', name: 'Bình', accessToken: 'member-jwt', expiresAt: Date.now() + 3600e3 }
  });
  page = s.page;
  check('?lang=vi mở bằng tiếng Việt', await page.textContent('#fb-submit') === 'Gửi phiếu');
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
  check('gửi kind feedback cho hic, không ảnh', s.db.posts[0].kind === 'feedback' && s.db.posts[0].game_id === 'hic' && s.db.posts[0].shots.length === 0 && s.db.uploads.length === 0);
  check('không cuộn ngang ở 390px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('không lỗi trang', !s.problems.length, s.problems.join(' | '));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-phone.png'), fullPage: true });
  await s.ctx.close();

  console.log('feedback.html · bảng chưa cài');
  s = await open(br, base, 'feedback.html', { viewport: { width: 1280, height: 800 }, missing: true });
  check('báo hộp thư chưa mở', /db\/feedback\.sql/.test(await s.page.textContent('#fb-banner')) && await s.page.isVisible('#fb-banner'));
  check('nút gửi bị khoá', await s.page.isDisabled('#fb-submit'));
  await s.ctx.close();
}

async function adminPage(br, base) {
  console.log('feedback-admin.html · khách, chưa đăng nhập');
  let s = await open(br, base, 'feedback-admin.html', { viewport: { width: 1280, height: 800 } });
  let { page } = s;
  await page.waitForSelector('#fa-gate:not([hidden])');
  check('chưa đăng nhập thì hiện cổng, không hiện phiếu', await page.isHidden('#fa-board') && /Sign in with a hub admin account/.test(await page.textContent('#fa-gate-note')));
  check('nút Sign in dẫn về login rồi quay lại', await page.getAttribute('#fa-signin', 'href') === 'login.html?next=feedback-admin.html' && await page.textContent('#fa-signin') === 'Sign in');
  await page.click('.fa-keybox summary');
  await page.click('#fa-key');
  await page.keyboard.type('wrong');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /rejected/.test(document.getElementById('fa-key-msg').textContent));
  check('khoá sai bị từ chối, không lưu', await page.isHidden('#fa-board') && await page.evaluate(() => localStorage.getItem('hub.feedback.key')) === null);
  await page.click('#fa-key');
  await page.keyboard.type(KEY);
  await page.click('#fa-unlock button[type="submit"]');
  await page.waitForSelector('#fa-board:not([hidden])');
  check('khoá đúng mở được bảng', await page.isVisible('#fa-lock'));
  await page.click('#fa-lock');
  await page.waitForSelector('#fa-gate:not([hidden])');
  check('Forget key quên khoá, quay về cổng', await page.evaluate(() => localStorage.getItem('hub.feedback.key')) === null);
  check('không lỗi trang', !s.problems.length, s.problems.join(' | '));
  await s.ctx.close();

  console.log('feedback-admin.html · thành viên thường');
  s = await open(br, base, 'feedback-admin.html', { viewport: { width: 1280, height: 800 }, session: PLAYER });
  await s.page.waitForSelector('#fa-gate:not([hidden])');
  check('thành viên thường thấy báo không có quyền', /binh@example\.com is signed in, but this account is not a feedback admin/.test(await s.page.textContent('#fa-gate-note')) && await s.page.textContent('#fa-signin') === 'Use another account');
  await s.ctx.close();

  console.log('feedback-admin.html · admin đăng nhập, desktop 1280x800');
  s = await open(br, base, 'feedback-admin.html', { viewport: { width: 1280, height: 800 }, session: ADMIN });
  page = s.page;
  await page.waitForSelector('#fa-board:not([hidden])');
  check('admin vào thẳng, không cần khoá', await page.isHidden('#fa-gate') && await page.isHidden('#fa-lock') && /poke5121999@gmail\.com/.test(await page.textContent('#fa-who')));
  const stats = await page.$$eval('.fa-stat', (n) => n.map((x) => x.innerText.replace(/\s+/g, ' ')));
  check('thống kê theo status đúng', JSON.stringify(stats) === JSON.stringify(['3 Open', '2 New', '1 In progress', '1 Fixed', '1 Won\'t fix', '5 All']), JSON.stringify(stats));
  check('mặc định lọc phiếu đang mở', await page.textContent('#fa-count') === '3 of 5 reports');

  await page.click('.fa-stat--all');
  await page.selectOption('#fa-game', 'dredge');
  check('lọc theo game', JSON.stringify(await titles(page)) === JSON.stringify(['Không lặp lại được', 'Thêm nút tắt nhạc', 'Thuyền kẹt ở bãi đá']), JSON.stringify(await titles(page)));
  await page.selectOption('#fa-kind', 'feedback');
  check('lọc theo loại', JSON.stringify(await titles(page)) === JSON.stringify(['Thêm nút tắt nhạc']));
  await page.selectOption('#fa-game', '');
  await page.selectOption('#fa-kind', '');
  await page.click('#fa-search');
  await page.keyboard.type('#3');
  check('tìm theo #id', JSON.stringify(await titles(page)) === JSON.stringify(['Rơi khung hình ở màn 3']));

  await page.click('.fa-items .fb-item summary');
  check('mở phiếu thấy env và ảnh', /390x844@3 · rev 20261001a/.test(await page.textContent('.fa-env')) && await page.$$eval('.fa-items .fb-item__shots img', (n) => n.length) === 1);
  await page.selectOption('.fa-editor__status', 'closed');
  await page.click('.fa-editor__note');
  await page.keyboard.type('abc1234: giảm số hạt ở màn 3');
  await page.click('.fa-editor .fb-submit');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.fa-editor .fb-msg').textContent));
  const call = s.db.rpc.find((r) => r[0] === 'fb_set_status');
  check('Lưu gọi fb_set_status bằng JWT admin, không kèm khoá', call && call[1].p_id === 3 && call[1].p_status === 'closed' && call[1].p_resolution === 'abc1234: giảm số hạt ở màn 3' && call[1].p_key === null && call[2] === 'Bearer admin-jwt', JSON.stringify(call));
  check('phiếu đổi chip sang Fixed, vẫn mở', await page.textContent('.fa-items .fb-chip') === 'Fixed' && await page.$eval('.fa-items details', (d) => d.open));
  check('thống kê cập nhật', /^0\s/.test(await page.innerText('.fa-stat--doing')) && /^2\s/.test(await page.innerText('.fa-stat--closed')));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'feedback-admin.png'), fullPage: true });

  page.once('dialog', (d) => d.accept());
  await page.click('.fa-del');
  await page.waitForFunction(() => /No reports match/.test(document.getElementById('fa-items').textContent));
  check('Xoá gọi fb_delete và bỏ phiếu khỏi danh sách', s.db.rpc.some((r) => r[0] === 'fb_delete' && r[1].p_id === 3) && /4 reports/.test(await page.textContent('#fa-count')));

  await page.click('#fb-lang [data-lang="vi"]');
  check('trang quản lý đổi sang tiếng Việt', await page.textContent('h1') === 'Quản lý phiếu');
  check('không lỗi trang', !s.problems.length, s.problems.join(' | '));
  await s.ctx.close();

  console.log('feedback-admin.html · admin token hết hạn, điện thoại 390x844');
  s = await open(br, base, 'feedback-admin.html', { viewport: { width: 390, height: 844 }, scheme: 'light', session: Object.assign({}, ADMIN, { accessToken: 'stale', expiresAt: Date.now() - 1000 }) });
  await s.page.waitForSelector('.fa-items .fb-item');
  check('token hết hạn được làm mới rồi vào thẳng', await s.page.evaluate(() => JSON.parse(localStorage.getItem('hub.session.v1')).accessToken) === 'admin-jwt');
  await s.page.click('.fa-items .fb-item summary');
  check('không cuộn ngang ở 390px', await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (SHOTS) await s.page.screenshot({ path: path.join(SHOTS, 'feedback-admin-phone.png'), fullPage: true });
  await s.ctx.close();

  console.log('feedback-admin.html · khoá lưu sẵn đã bị thay');
  s = await open(br, base, 'feedback-admin.html', { viewport: { width: 1280, height: 800 }, adminKey: 'old-key' });
  await s.page.waitForFunction(() => /rejected/.test(document.getElementById('fa-key-msg').textContent));
  check('khoá cũ sai thì quay về cổng và bị quên', await s.page.isVisible('#fa-gate') && await s.page.evaluate(() => localStorage.getItem('hub.feedback.key')) === null);
  await s.ctx.close();

  console.log('login.html?next=feedback-admin.html');
  s = await open(br, base, 'login.html', { viewport: { width: 1280, height: 800 }, query: '?next=feedback-admin.html' });
  await s.page.fill('#login-form input[name="email"]', ADMIN.email);
  await s.page.fill('#login-form input[name="password"]', 'secret123');
  await s.page.click('#login-form button[type="submit"]');
  await s.page.waitForURL((u) => u.pathname.endsWith('/feedback-admin.html'));
  await s.page.waitForSelector('#fa-board:not([hidden])');
  check('đăng nhập xong quay về trang quản lý và vào thẳng', true);
  await s.ctx.close();
  s = await open(br, base, 'login.html', { viewport: { width: 1280, height: 800 }, query: '?next=https://evil.example/x.html' });
  await s.page.fill('#login-form input[name="email"]', ADMIN.email);
  await s.page.fill('#login-form input[name="password"]', 'secret123');
  await s.page.click('#login-form button[type="submit"]');
  await s.page.waitForURL((u) => u.pathname.endsWith('/index.html'));
  check('next trỏ ra ngoài bị bỏ qua, về index.html', true);
  await s.ctx.close();
}

(async () => {
  const { chromium } = require(PW);
  const srv = process.env.FB_URL ? { base: process.env.FB_URL.replace(/\/+$/, ''), close() {} } : await serve();
  const br = await chromium.launch();
  try {
    await reportPage(br, srv.base);
    await adminPage(br, srv.base);

    console.log('lối vào');
    const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'guest', name: 'Khách' })));
    const hub = await ctx.newPage();
    await hub.goto(srv.base + '/index.html', { waitUntil: 'networkidle' });
    await hub.click('.hub-feedback-link');
    await hub.waitForURL(/feedback\.html/);
    check('nút ở đầu hub mở feedback.html', true);
    await ctx.close();
  } finally {
    await br.close();
    srv.close();
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
