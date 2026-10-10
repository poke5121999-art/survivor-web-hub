/*
 * CÂY GIA PHẢ — bộ kiểm nhạc nền, tủ truyện và "Kể chuyện cả cây". Đi đúng đường người dùng: bấm,
 * chọn tệp thật qua ô tải lên, tải lại trang để chứng minh dữ liệu nằm trong IndexedDB.
 *
 * Chạy:  node test/gia-pha-truyen-nhac.js
 *        GP_URL=https://.../games/gia-pha/index.html node test/gia-pha-truyen-nhac.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/gia-pha-shots), phải mở ra xem bằng mắt.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'gia-pha-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail != null ? '  — ' + detail : ''));
  ok ? pass++ : fail++;
}

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

// WAV đơn kênh, sóng sin, đủ để trình duyệt phát và đồng hồ chạy.
function wav(sec, hz) {
  const rate = 8000, n = Math.floor(rate * sec), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * hz * 2 * Math.PI) * 12000), 44 + i * 2);
  return b;
}

const STORY_TXT = 'Chuyện ông Khoa đi lính\n\nNăm 1980 ông Khoa lên đường nhập ngũ, mang theo chiếc khăn bà Yến thêu.\n\nBa năm sau ông về, chiếc khăn vẫn còn trong túi áo.';

async function main() {
  const srv = process.env.GP_URL ? null : await serve();
  const URL0 = process.env.GP_URL || 'http://127.0.0.1:' + srv.address().port + '/games/gia-pha/index.html';
  const browser = await chromium.launch(Object.assign({ args: ['--autoplay-policy=user-gesture-required'] }, process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  page.on('response', (r) => r.status() >= 400 && errs.push('http ' + r.status() + ' ' + r.url()));

  const card = (name) => page.locator('.card:not(.dying)', { has: page.locator('.nm', { hasText: new RegExp('^' + name + '$') }) });
  const settle = (ms) => page.waitForTimeout(ms || 750);
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const bgm = () => page.evaluate(() => { const a = document.getElementById('bgm'); return { paused: a.paused, t: a.currentTime, src: a.getAttribute('src') || '' }; });
  const muRows = () => page.locator('#mu-menu .mu-row').count();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-up-'));
  const file = (name, data) => { const p = path.join(tmp, name); fs.writeFileSync(p, data); return p; };

  await page.goto(URL0);
  await page.waitForSelector('body.ready');
  await settle();
  await page.locator('#help .help-x').click();
  await settle(300);

  // ---- truyện mẫu ----
  check('nút 📖 trên thanh trên ghi 1 truyện (truyện mẫu)', (await page.textContent('#stories-n')) === '1', await page.textContent('#stories-n'));
  await page.keyboard.press('f'); await settle();
  check('thẻ cụ Phúc có dấu 📖1', /📖1/.test(await card('Nguyễn Văn Phúc').textContent()));
  check('trước cú chạm đầu tiên: nhạc chưa phát (trình duyệt chặn tự phát)', (await bgm()).paused);

  // ---- nhạc nền: bài mặc định phát ở cú chạm đầu tiên ----
  const sb = await page.locator('#stage').boundingBox();
  await page.mouse.click(sb.x + 30, sb.y + sb.height - 30);
  await settle(2500);
  const b1 = await bgm();
  check('cú chạm đầu tiên: bài mặc định bắt đầu phát', !b1.paused && /^blob:/.test(b1.src), JSON.stringify(b1));
  check('nhạc chạy thật: đồng hồ bài đã qua 1 giây', b1.t > 1, b1.t.toFixed(2));
  check('nút ♪ chuyển sang cột sóng đang nhảy', await page.locator('#music-btn.on .eq').isVisible());
  let beatMax = 0;
  for (let i = 0; i < 12; i++) { beatMax = Math.max(beatMax, +(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--beat')))); await settle(80); }
  check('đo được độ to của nhạc (cây "thở" theo nhạc)', beatMax > 0.03, beatMax.toFixed(3));
  const sapOp = await page.evaluate(() => { const s = document.querySelector('.lk .sap'); return s ? +getComputedStyle(s).opacity : -1; });
  check('nhạc phát: đốm nhựa sống hiện trên nhánh', sapOp > 0.3, sapOp);
  await shot('20-nhac-dang-phat');

  // ---- danh sách nhạc ----
  await page.locator('#music-btn').click();
  await page.waitForSelector('#mu-menu.in');
  check('danh sách nhạc có đúng 1 bài mặc định', (await muRows()) === 1 && /Ru con/.test(await page.textContent('#mu-menu')), await muRows());
  check('bài mặc định không có nút gỡ', (await page.locator('#mu-menu .mu-x').count()) === 0);
  await page.setInputFiles('#mu-file', [file('Hò kéo lưới.wav', wav(3, 330)), file('Lý ngựa ô.wav', wav(3, 440))]);
  await settle(1500);
  check('tải 2 bài lên: danh sách có 3 bài', (await muRows()) === 3, await muRows());
  const b2 = await bgm();
  check('tải lên xong: phát ngay bài vừa tải', !b2.paused && b2.src !== b1.src && /Hò kéo lưới/.test(await page.textContent('#mu-menu .mu-row.cur')), JSON.stringify(b2));
  await page.locator('#mu-menu [data-mu="next"]').click();
  await settle(800);
  check('bấm bài sau: sang "Lý ngựa ô"', /Lý ngựa ô/.test(await page.textContent('#mu-menu .mu-row.cur')));
  await settle(3200);
  check('hết bài thì tự sang bài kế (quay về bài mặc định)', /Ru con/.test(await page.textContent('#mu-menu .mu-row.cur')) && !(await bgm()).paused, await page.textContent('#mu-menu .mu-row.cur'));
  await shot('21-danh-sach-nhac');
  await page.locator('#mu-menu .mu-row', { hasText: 'Hò kéo lưới' }).locator('.mu-x').click();
  await settle(400);
  check('gỡ một bài: còn 2 bài', (await muRows()) === 2, await muRows());
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await settle(500);
  await page.locator('#music-btn').click();
  await page.waitForSelector('#mu-menu.in');
  check('Ctrl+Z: bài vừa gỡ quay lại danh sách', (await muRows()) === 3, await muRows());
  await page.locator('#mu-menu [data-mu="toggle"]').click();
  await settle(300);
  check('bấm dừng: nhạc dừng', (await bgm()).paused);
  await page.keyboard.press('Escape');

  // ---- tủ truyện: tải lên ----
  await page.locator('#stories-btn').click();
  await page.waitForSelector('#stories.open');
  await settle(400);
  check('tủ truyện mở, có truyện mẫu', (await page.locator('#st-grid .st-card').count()) === 1);
  await page.setInputFiles('#st-file', file('ong-khoa.txt', STORY_TXT));
  await page.waitForSelector('#reader.open');
  await settle(600);
  check('tải 1 tệp văn bản: mở ngay trang đọc', (await page.locator('#reader.open').count()) === 1);
  check('dòng đầu thành tiêu đề', (await page.textContent('#rd-title')) === 'Chuyện ông Khoa đi lính', await page.textContent('#rd-title'));
  check('thân bài chia đoạn', (await page.locator('#rd-body p').count()) === 2, await page.locator('#rd-body p').count());
  await page.locator('[data-rd="tag"]').click();
  await page.locator('.tag-pop input').fill('khoa');
  await page.locator('.tag-pop .tag-row', { hasText: 'Nguyễn Văn Khoa' }).click();
  await page.locator('.tag-pop input').fill('yen');
  await page.locator('.tag-pop .tag-row', { hasText: 'Đỗ Thị Yến' }).click();
  await page.locator('.tag-pop .btn').click();
  await settle(300);
  check('gắn 2 người: chip hiện trên trang đọc', (await page.locator('#rd-ppl .pchip[data-go]').count()) === 2);
  await shot('22-trang-doc');
  await page.locator('#rd-close').click();
  await settle(400);
  check('tủ có 2 truyện', (await page.locator('#st-grid .st-card').count()) === 2);
  await page.setInputFiles('#st-file', [file('loi-ba-ke.wav', wav(2, 220)), file('gia-pha-cu.pdf', '%PDF-1.1\n%¥±ë\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj trailer<</Root 1 0 R>>\n%%EOF')]);
  await settle(800);
  check('tải 2 tệp một lúc (ghi âm + PDF): tủ có 4 truyện, không tự mở trang đọc', (await page.locator('#st-grid .st-card').count()) === 4 && !(await page.locator('#reader.open').count()));
  await shot('23-tu-truyen');
  await page.locator('.st-card', { hasText: 'loi ba ke' }).click();
  await page.waitForSelector('#reader.open');
  await settle(600);
  check('truyện ghi âm: có trình phát và cuộn băng', (await page.locator('#rd-files .rd-tape').count()) === 1 && (await page.locator('#rd-files audio').count()) === 1);
  await page.evaluate(() => GP.music.play());
  await settle(500);
  await page.evaluate(() => document.querySelector('#rd-files audio').play());
  await settle(500);
  check('nghe lời kể: nhạc nền tự nhường', (await bgm()).paused);
  await page.evaluate(() => document.querySelector('#rd-files audio').pause());
  await settle(600);
  check('dừng lời kể: nhạc nền trở lại', !(await bgm()).paused);
  await page.locator('#rd-close').click();
  await settle(300);

  // ---- viết truyện ----
  await page.locator('[data-st="write"]').click();
  await page.waitForSelector('#reader.open.editing');
  await page.locator('#rd-title').click();
  await page.keyboard.type('Bữa cơm ngày giỗ');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Năm nào cũng vậy, cả họ về nhà thờ từ sáng sớm.');
  await settle(700);
  await page.locator('#rd-edit').click();
  await settle(300);
  check('viết truyện: bấm Xong thì thôi sửa, chữ còn nguyên', /cả họ về nhà thờ/.test(await page.textContent('#rd-body')) && !(await page.locator('#reader.editing').count()));
  await page.locator('#rd-close').click();
  await settle(300);
  check('tủ có 5 truyện, truyện mới nằm đầu', (await page.locator('#st-grid .st-card').count()) === 5 && /Bữa cơm ngày giỗ/.test(await page.locator('#st-grid .st-card').first().textContent()));
  await page.locator('[data-st="write"]').click();
  await page.waitForSelector('#reader.open');
  await page.locator('#rd-close').click();
  await settle(300);
  check('mở viết rồi đóng ngay: không để lại truyện trống', (await page.locator('#st-grid .st-card').count()) === 5, await page.locator('#st-grid .st-card').count());
  await page.keyboard.press('Escape');
  await settle(300);
  check('Esc đóng tủ truyện', !(await page.locator('#stories.open').count()));

  // ---- truyện trên cây và trong bảng chi tiết ----
  await page.keyboard.press('f'); await settle();
  check('thẻ ông Khoa hiện 📖1', /📖1/.test(await card('Nguyễn Văn Khoa').textContent()));
  await card('Nguyễn Văn Khoa').click();
  await settle();
  await page.locator('.pn-tabs [data-tab="info"]').click();
  check('bảng chi tiết ông Khoa liệt kê truyện', /Chuyện ông Khoa đi lính/.test(await page.textContent('#pn-st')));
  await page.locator('#pn-st .pn-st-row').first().click();
  await page.waitForSelector('#reader.open');
  check('bấm truyện trong bảng: mở đúng truyện', (await page.textContent('#rd-title')) === 'Chuyện ông Khoa đi lính');
  await page.locator('#rd-del').click();
  await page.locator('.modal .btn.danger').click();
  await settle(400);
  check('xoá truyện: thẻ ông Khoa mất 📖', !/📖/.test(await card('Nguyễn Văn Khoa').textContent()));
  await page.locator('.toast button', { hasText: 'Hoàn tác' }).first().click();
  await settle(400);
  check('hoàn tác: truyện quay lại, thẻ có 📖1', /📖1/.test(await card('Nguyễn Văn Khoa').textContent()));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  // ---- tải lại: mọi thứ còn ----
  await page.reload();
  await page.waitForSelector('body.ready');
  await settle();
  check('tải lại: 📖 ghi 5 truyện', (await page.textContent('#stories-n')) === '5', await page.textContent('#stories-n'));
  await page.locator('#music-btn').click();
  await page.waitForSelector('#mu-menu.in');
  check('tải lại: danh sách nhạc còn 3 bài', (await muRows()) === 3, await muRows());
  check('đã bấm dừng thì tải lại không tự phát', (await bgm()).paused);
  await page.keyboard.press('Escape');

  // ---- kể chuyện cả cây ----
  await page.locator('#view-btn').click();
  await page.locator('.menu button', { hasText: 'Kể chuyện cả cây' }).click();
  await page.waitForSelector('#tour.open');
  await settle(1200);
  const t1 = await page.textContent('#tour-card');
  check('kể chuyện: bắt đầu từ cụ tổ, đọc truyện về cụ', /Nguyễn Văn Phúc/.test(t1) && /Gánh thuốc nam/.test(t1), t1.slice(0, 80));
  check('đoạn trích không dính chữ giữa hai đoạn', /thóc\. Bà Nhàn/.test(t1), t1.slice(140, 200));
  const tb = await page.locator('#tour').boundingBox(), pb = await card('Nguyễn Văn Phúc').boundingBox();
  check('kể chuyện: người đang kể nằm trên thanh kể, không bị che', pb.y + pb.height < tb.y, (pb.y + pb.height).toFixed(0) + ' / ' + tb.y.toFixed(0));
  await shot('24-ke-chuyen');
  await page.keyboard.press('ArrowRight');
  await settle(900);
  const t2 = await page.textContent('#tour-card .tc-nm');
  check('→ sang người kế tiếp', t2 && !/Nguyễn Văn Phúc/.test(t2), t2);
  await page.keyboard.press(' ');
  await settle(300);
  check('Space dừng kể', (await page.textContent('#tour-pp')) === '▶');
  await page.keyboard.press('Escape');
  await settle(500);
  check('Esc thôi kể', !(await page.locator('#tour.open').count()));

  // ---- xuất tệp mang theo truyện và nhạc ----
  await page.locator('#tree-btn').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.menu button', { hasText: 'Xuất ra tệp' }).click()]);
  const ex = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('xuất: tệp có 5 truyện và 2 bài nhạc kèm dữ liệu', Object.keys(ex.tree.stories).length === 5 && ex.tree.playlist.length === 2 && ex.tree.playlist.every((f) => ex.files[f]),
    Object.keys(ex.tree.stories).length + ' truyện, ' + ex.tree.playlist.length + ' bài');
  check('không có lỗi trang, console, HTTP', errs.length === 0, errs.slice(0, 5).join(' | '));
  await ctx.close();

  // ---- điện thoại ----
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mp = await m.newPage();
  const merrs = [];
  mp.on('pageerror', (e) => merrs.push(e.message));
  await mp.goto(URL0);
  await mp.waitForSelector('body.ready'); await mp.waitForTimeout(900);
  await mp.locator('#help .help-x').tap();
  await mp.waitForTimeout(400);
  check('điện thoại: nút 📖 và ♪ nằm trong màn', (await mp.locator('#stories-btn').isVisible()) && (await mp.locator('#music-btn').isVisible()) &&
    (await mp.locator('#view-btn').boundingBox()).x + 36 <= 391);
  await mp.locator('#music-btn').tap();
  await mp.waitForSelector('#mu-menu.in');
  const mb = await mp.locator('#mu-menu').boundingBox();
  check('điện thoại: bảng nhạc nằm trọn trong màn', mb.x >= 0 && mb.x + mb.width <= 390, mb.x.toFixed(0) + '..' + (mb.x + mb.width).toFixed(0));
  await mp.waitForTimeout(600);
  check('điện thoại: chạm đầu tiên vào nút ♪ chỉ mở bảng, không tự bật nhạc', await mp.evaluate(() => document.getElementById('bgm').paused));
  await mp.locator('#stories-btn').tap({ force: true });
  await mp.waitForSelector('#stories.open');
  await mp.locator('.st-card').first().tap();
  await mp.waitForSelector('#reader.open');
  await mp.waitForTimeout(600);
  check('điện thoại: chỉ có một truyện thì không hiện nút ‹ ›', !(await mp.locator('#rd-prev').isVisible()) && !(await mp.locator('#rd-next').isVisible()));
  const over = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.rd-page').scrollWidth > document.querySelector('.rd-page').clientWidth + 1);
  check('điện thoại: trang đọc không tràn ngang', !over);
  await mp.screenshot({ path: path.join(SHOTS, '25-dien-thoai-doc.png') });
  check('điện thoại: không lỗi trang', merrs.length === 0, merrs.join(' | '));
  await m.close();

  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(1); });
