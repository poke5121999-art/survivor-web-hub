/*
 * CÂY GIA PHẢ — bộ kiểm hành vi, đi đúng đường người dùng: chuột/phím thật, kéo thả thật,
 * tải lại trang để chứng minh dữ liệu nằm trong IndexedDB chứ không chỉ trong bộ nhớ.
 *
 * Chạy:  node test/gia-pha-suite.js                  (server tĩnh tự dựng ở cổng ngẫu nhiên)
 *        GP_URL=https://.../games/gia-pha/index.html node test/gia-pha-suite.js   (kiểm bản trên Pages)
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/gia-pha-shots), phải mở ra xem bằng mắt.
 *
 * Kỳ vọng viết cứng theo cây mẫu (25 người, 5 đời, cụ tổ Nguyễn Văn Phúc). Đổi cây mẫu thì bài phải đỏ.
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

// Tệp .docx tối thiểu (zip không nén) để kiểm xem trước Word, không cần thư viện ngoài.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8'), nm = Buffer.from(name), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nm, data); central.push(c, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const DOCX = zip([
  ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
  ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ['word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Văn tế cụ tổ họ Nguyễn</w:t></w:r></w:p></w:body></w:document>'],
]);
// Ảnh PNG 2x2 đỏ.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAwMDAwMAAAA4AAf9Rq1QAAAAASUVORK5CYII=', 'base64');

async function main() {
  const srv = process.env.GP_URL ? null : await serve();
  const URL0 = process.env.GP_URL || 'http://127.0.0.1:' + srv.address().port + '/games/gia-pha/index.html';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  page.on('response', (r) => r.status() >= 400 && errs.push('http ' + r.status() + ' ' + r.url()));

  const card = (name) => page.locator('.card:not(.dying)', { has: page.locator('.nm', { hasText: new RegExp('^' + name + '$') }) });
  const cardCount = () => page.locator('.card:not(.dying)').count();
  const settle = () => page.waitForTimeout(750);
  const box = async (name) => card(name).boundingBox();
  // Mở bảng chi tiết làm camera dời theo người được chọn; vừa khung trước khi đo hay bấm để thẻ cần dùng nằm trong màn.
  const fitNow = async () => { await page.keyboard.press('f'); await settle(); };
  const pick = async (name) => { await fitNow(); await card(name).click(); await settle(); };
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });

  await page.goto(URL0);
  await page.waitForSelector('body.ready');
  await settle();
  check('lần đầu mở: hướng dẫn tự hiện', await page.locator('#help.open').count() === 1);
  await page.keyboard.press('Escape');
  check('cây mẫu có 25 thẻ', (await cardCount()) === 25, await cardCount());
  check('thanh trên ghi "25 người · 5 đời"', (await page.textContent('#stats')) === '25 người · 5 đời', await page.textContent('#stats'));
  await shot('01-cay-mau');

  // Lớp phủ không được nuốt cú bấm vào vùng cây.
  const stageHits = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    const pts = [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7], [0.9, 0.2]];
    return pts.map(([fx, fy]) => { const e = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); return e && !!e.closest('#stage') && !e.closest('.zoom,.crumbs,.empty'); });
  });
  check('bấm giữa vùng cây trúng sân khấu, không trúng lớp phủ', stageHits.every(Boolean), JSON.stringify(stageHits));

  // ---- chọn người, bảng chi tiết ----
  await card('Nguyễn Văn Hiếu').click();
  await settle();
  check('bấm thẻ mở bảng chi tiết đúng người', (await page.inputValue('#pn-name')) === 'Nguyễn Văn Hiếu');
  check('bảng ghi đời và cha mẹ', /Đời 2 · con của Nguyễn Văn Phúc & Trần Thị Nhàn/.test(await page.textContent('#pn-sub')), await page.textContent('#pn-sub'));
  check('mục Con liệt kê ba người con', (await page.locator('#pn-rel .rrow', { hasText: 'Con' }).last().locator('.pchip').count()) === 3);

  // ---- thêm con bằng nút + quanh thẻ ----
  const hieu = await box('Nguyễn Văn Hiếu');
  await page.mouse.move(hieu.x + hieu.width / 2, hieu.y + hieu.height / 2);
  await page.locator('.card.sel .qa-child').click();
  await page.waitForSelector('.pop.in');
  await page.fill('#pop-name', 'Nguyễn Văn Lộc');
  await page.fill('#pop-born', '1958');
  await page.keyboard.press('Enter');
  await settle();
  const loc = await box('Nguyễn Văn Lộc');
  check('thêm con: thẻ mới hiện ra', !!loc && (await cardCount()) === 26, await cardCount());
  check('thêm con: thẻ mới nằm hàng dưới cha', loc && loc.y > hieu.y + 40, loc && hieu && (loc.y - hieu.y).toFixed(0));
  check('thêm con: bảng chuyển sang người mới', (await page.inputValue('#pn-name')) === 'Nguyễn Văn Lộc');
  await shot('02-them-con');

  // ---- sửa tên trong bảng, thẻ đổi theo ----
  await page.fill('#pn-name', 'Nguyễn Văn Lộc Tài');
  await settle();
  check('sửa tên: thẻ trên cây đổi theo', (await card('Nguyễn Văn Lộc Tài').count()) === 1);
  const fit = await page.evaluate(() => { const p = document.getElementById('panel').getBoundingClientRect(); return [...document.querySelectorAll('#pn-born,#pn-died,#pn-place')].every((i) => i.getBoundingClientRect().right <= p.right - 10); });
  check('ô Năm sinh / Năm mất / Quê quán nằm trọn trong bảng', fit);
  const longName = 'Nguyễn Hoàng Phương Thảo Nguyên Bích Ngọc Lan Chi Mai Anh Tuyết Nhung Hồng Đào';
  await page.fill('#pn-name', longName);
  const nameFits = await page.evaluate(() => { const t = document.getElementById('pn-name'); return t.scrollHeight <= t.clientHeight + 2 && t.clientHeight > 40; });
  check('tên rất dài xuống dòng, hiện đủ trong bảng', nameFits);
  await page.fill('#pn-name', 'Nguyễn Văn Lộc Tài');
  await page.waitForTimeout(300);

  // ---- thu / mở nhánh ----
  await page.keyboard.press('Escape');
  check('Esc thứ nhất chỉ rời ô đang gõ, bảng còn mở', await page.locator('#panel.open').count() === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Esc thứ hai đóng bảng', await page.locator('#panel.open').count() === 0);
  const tog = async () => { const b = await card('Nguyễn Văn Thành').locator('.tog').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  await tog();
  await settle();
  check('thu nhánh Thành: ẩn 7 người (5 con cháu + 2 dâu rể)', (await cardCount()) === 19, await cardCount());
  check('nút thu đổi thành +5 (số con cháu trong dòng)', (await card('Nguyễn Văn Thành').locator('.tog').textContent()) === '+5');
  await shot('03-thu-nhanh');
  await tog();
  await settle();
  check('mở lại nhánh: đủ 26 thẻ', (await cardCount()) === 26);
  await tog(); await page.waitForTimeout(120); await tog();
  await settle();
  check('thu rồi mở lại ngay giữa hoạt ảnh: không mất thẻ nào', (await cardCount()) === 26, await cardCount());

  // ---- kéo thả: chuyển Nguyễn Thị Lan làm con của Nguyễn Văn Thành ----
  await page.click('#zfit'); await settle();
  const lan = await box('Nguyễn Thị Lan'), thanh = await box('Nguyễn Văn Thành');
  await page.mouse.move(lan.x + 60, lan.y + 30);
  await page.mouse.down();
  await page.mouse.move(lan.x + 80, lan.y + 40, { steps: 4 });
  await page.mouse.move(thanh.x + thanh.width / 2, thanh.y + thanh.height / 2, { steps: 12 });
  const hintTxt = await page.textContent('#drag-hint');
  check('kéo: gợi ý thả hiện đúng', hintTxt === 'Thả: làm con của Nguyễn Văn Thành', hintTxt);
  await shot('04-dang-keo');
  await page.mouse.up();
  await settle();
  const lan2 = await box('Nguyễn Thị Lan');
  check('thả: Lan xuống một đời (nằm thấp hơn Thành)', lan2.y > thanh.y + 40, (lan2.y - thanh.y).toFixed(0));
  check('thả: Vũ Văn Bình (chồng) và Vũ Thị Thu (con) đi theo', (await box('Vũ Văn Bình')).y === lan2.y && (await box('Vũ Thị Thu')).y > lan2.y);
  await card('Nguyễn Thị Lan').click(); await settle();
  check('thả: bảng ghi Lan là con của Thành', /con của Nguyễn Văn Thành/.test(await page.textContent('#pn-sub')), await page.textContent('#pn-sub'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await settle();
  const lan3 = await box('Nguyễn Thị Lan'), thanh3 = await box('Nguyễn Văn Thành');
  check('Ctrl+Z trả Lan về đời 2 (cùng hàng với Thành)', Math.abs(lan3.y - thanh3.y) < 2, (lan3.y - thanh3.y).toFixed(0));
  await fitNow();

  // Kéo cha lên con cháu của mình phải bị chặn.
  const phuc = await box('Nguyễn Văn Phúc'), duc = await box('Nguyễn Văn Đức');
  await page.mouse.move(phuc.x + 60, phuc.y + 30); await page.mouse.down();
  await page.mouse.move(phuc.x + 80, phuc.y + 50, { steps: 4 });
  await page.mouse.move(duc.x + duc.width / 2, duc.y + duc.height / 2, { steps: 12 });
  const bad = await page.textContent('#drag-hint');
  check('kéo cụ tổ lên cháu: bị chặn, có lời giải thích', bad === 'Không được: đó là con cháu của người này', bad);
  await page.mouse.up(); await settle();
  check('bị chặn: cây giữ nguyên', (await box('Nguyễn Văn Phúc')).y < (await box('Nguyễn Văn Đức')).y);

  // ---- xoá + hoàn tác ----
  await pick('Trịnh Bảo An');
  await page.keyboard.press('Escape');
  await pick('Trịnh Bảo An');
  await page.locator('#pn-actions [data-pa="remove"]').click();
  await page.locator('.modal .btn.danger').click();
  await settle();
  check('xoá: thẻ biến mất', (await card('Trịnh Bảo An').count()) === 0);
  await page.locator('.toast button', { hasText: 'Hoàn tác' }).first().click();
  await settle();
  check('hoàn tác từ thông báo: thẻ quay lại', (await card('Trịnh Bảo An').count()) === 1);

  // Xoá người có con cháu: hỏi xoá cả nhánh hay giữ.
  await pick('Nguyễn Văn Khoa');
  await page.locator('#pn-actions [data-pa="remove"]').click();
  const dlg = await page.textContent('.modal');
  check('xoá người có con cháu: hỏi hai cách', /có 3 con cháu/.test(dlg) && /Chỉ xoá người này/.test(dlg) && /Xoá cả nhánh \(6 người\)/.test(dlg), dlg.replace(/\s+/g, ' ').slice(0, 120));
  await page.locator('.modal .btn', { hasText: 'Chỉ xoá người này' }).click();
  await settle();
  const trang = await box('Đặng Thu Trang');
  check('giữ con cháu: con theo mẹ Đặng Thu Trang, mẹ thành gốc nhánh', trang && (await box('Nguyễn Khánh Linh')).y > trang.y && (await card('Nguyễn Văn Khoa').count()) === 0);
  await page.keyboard.press('Control+z'); await settle();
  check('Ctrl+Z: Khoa trở lại', (await card('Nguyễn Văn Khoa').count()) === 1);

  // ---- ghi chú kiểu Word ----
  await pick('Nguyễn Văn Đức');
  await page.click('.pn-tabs [data-tab="note"]');
  await page.click('#pn-doc');
  await page.keyboard.type('Ông Đức là bộ đội công binh.');
  await page.keyboard.press('Enter');
  await page.click('#tb [data-cmd="bold"]');
  await page.keyboard.type('Huân chương Kháng chiến');
  await page.waitForTimeout(700);
  check('ghi chú: chữ đậm được bọc thẻ <b>', /<b>Huân chương Kháng chiến<\/b>/.test(await page.innerHTML('#pn-doc')), (await page.innerHTML('#pn-doc')).slice(0, 120));
  check('ghi chú: chân trang báo đã lưu', (await page.textContent('#pn-saved')) === 'Đã lưu ✓');
  await page.keyboard.press('Enter');
  await page.click('#tb [data-cmd="bold"]');
  await page.click('#tb [data-cmd="table"]');
  await page.keyboard.type('ô1');
  check('chèn bảng: con trỏ vào ô đầu, gõ là vào ô', (await page.locator('#pn-doc table td').first().textContent()) === 'ô1', await page.locator('#pn-doc table td').first().textContent());
  await page.click('#tb [data-cmd="full"]');
  await page.waitForTimeout(500);
  await shot('05-ghi-chu-trang-giay');
  check('ghi chú: nút ⛶ mở thành trang giấy toàn màn', await page.locator('section.full').count() === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc đóng trang giấy', await page.locator('section.full').count() === 0);

  // ---- tài liệu: ảnh, Word, âm thanh ----
  await page.click('.pn-tabs [data-tab="files"]');
  await page.setInputFiles('#pn-file', [
    { name: 'giay-khai-sinh.png', mimeType: 'image/png', buffer: PNG },
    { name: 'van-te.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: DOCX },
    { name: 'loi-ke.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(64) },
  ]);
  await settle();
  check('tài liệu: ba tệp hiện trong danh sách', (await page.locator('#pn-files .fi').count()) === 3, await page.locator('#pn-files .fi').count());
  check('tài liệu: thẻ tab ghi số 3', (await page.textContent('#pn-nfiles')) === '3');
  check('tài liệu: thẻ trên cây hiện 📎3', /📎3/.test(await card('Nguyễn Văn Đức').textContent()));
  check('tài liệu: âm thanh có trình phát ngay trong danh sách', (await page.locator('#pn-files .k-audio audio').count()) === 1);
  await page.locator('#pn-files .k-image .fi-name').click();
  await page.waitForTimeout(400);
  check('bấm vào tên tệp cũng mở xem trước', await page.locator('#viewer.open').count() === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('#pn-files .k-image .fi-thumb').click();
  await page.waitForTimeout(500);
  const imgOk = await page.evaluate(() => { const i = document.querySelector('#vw-body img'); return !!i && i.complete && i.naturalWidth === 2; });
  check('xem ảnh: ảnh 2x2 tải được trong trình xem', imgOk);
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('#vw-body .paper.docx', { timeout: 8000 }).catch(() => {});
  const docxTxt = await page.textContent('#vw-body').catch(() => '');
  check('xem Word: → sang tệp .docx, đọc ra chữ', /Văn tế cụ tổ họ Nguyễn/.test(docxTxt), docxTxt.slice(0, 60));
  await shot('06-xem-word');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('#pn-files .k-image [data-fa="avatar"]').click();
  await settle();
  check('đặt ảnh làm ảnh đại diện: thẻ trên cây hiện ảnh', await card('Nguyễn Văn Đức').locator('.av img').count() === 1);

  // ---- tìm người ----
  await page.keyboard.press('Escape');
  await page.click('#search');
  await page.keyboard.type('bao an');
  await page.waitForTimeout(200);
  check('tìm không dấu "bao an" ra Trịnh Bảo An', /Trịnh Bảo An/.test(await page.textContent('#search-res')));
  await page.keyboard.press('Enter');
  await settle();
  check('chọn kết quả: mở bảng đúng người', (await page.inputValue('#pn-name')) === 'Trịnh Bảo An');

  // ---- chỉ xem một nhánh ----
  await pick('Nguyễn Văn Thành');
  await page.click('.pn-tabs [data-tab="info"]');
  await page.locator('#pn-actions [data-pa="focus"]').click();
  await settle();
  check('chỉ xem nhánh Thành: còn 9 thẻ', (await cardCount()) === 9, await cardCount());
  check('thanh "Nhánh:" hiện đường từ cụ tổ', /Nguyễn Văn Phúc.*Nguyễn Văn Thành/.test(await page.textContent('#crumbs')));
  check('trong nhánh vẫn ghi đúng đời thật (Thành là Đời 2)', /Đời 2/.test(await card('Nguyễn Văn Thành').textContent()));
  await shot('07-soi-nhanh');
  await page.click('#crumbs .cr-x'); await settle();
  check('Xem cả cây: đủ 26 thẻ', (await cardCount()) === 26);

  // ---- dữ liệu còn sau khi tải lại ----
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('body.ready'); await settle();
  check('tải lại: còn 26 người', (await cardCount()) === 26, await cardCount());
  check('tải lại: tên đã sửa còn', (await card('Nguyễn Văn Lộc Tài').count()) === 1);
  await pick('Nguyễn Văn Đức');
  await page.click('.pn-tabs [data-tab="note"]');
  check('tải lại: ghi chú còn chữ đậm', /<b>Huân chương Kháng chiến<\/b>/.test(await page.innerHTML('#pn-doc')));
  check('tải lại: còn 3 tài liệu', (await page.textContent('#pn-nfiles')) === '3');

  // ---- xuất rồi nhập lại thành cây mới ----
  await page.keyboard.press('Escape');
  await page.click('#tree-btn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.menu button', { hasText: 'Xuất ra tệp' }).click()]);
  const file = path.join(SHOTS, 'export.json');
  await dl.saveAs(file);
  const ex = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = new Date(), z = (n) => String(n).padStart(2, '0');
  const today = now.getFullYear() + '-' + z(now.getMonth() + 1) + '-' + z(now.getDate());
  check('xuất: tên tệp ghi ngày theo giờ máy, không gạch đôi', dl.suggestedFilename() === 'gia-pha-ho-nguyen-van-mau-' + today + '.json', dl.suggestedFilename());
  check('xuất: tệp có 26 người và 3 tài liệu kèm', Object.keys(ex.tree.people).length === 26 && Object.keys(ex.files).length === 3, Object.keys(ex.tree.people).length + ' người, ' + Object.keys(ex.files).length + ' tệp');
  await page.setInputFiles('#import-file', file);
  await settle(); await page.waitForTimeout(400);
  check('nhập: mở thành cây mới đủ 26 thẻ', (await cardCount()) === 26);
  await pick('Nguyễn Văn Đức');
  await page.click('.pn-tabs [data-tab="files"]'); await settle();
  const imported = await page.evaluate(() => { const i = document.querySelector('#pn-files .k-image img'); return i && i.complete && i.naturalWidth; });
  check('nhập: ảnh đính kèm đọc lại được', imported === 2, imported);
  await page.click('#tree-btn');
  await page.waitForSelector('.menu.in');
  check('menu cây liệt kê 2 cây', (await page.locator('.menu button small', { hasText: 'người' }).count()) === 2);
  await page.keyboard.press('Escape'); await page.mouse.click(5, 300);

  // ---- cây mới trống ----
  await page.click('#tree-btn');
  await page.locator('.menu button', { hasText: 'Tạo cây mới' }).click();
  await page.fill('.modal input', 'Họ Trần');
  await page.keyboard.press('Enter');
  await settle();
  check('cây mới: hiện màn trống', await page.locator('#empty.show').count() === 1);
  await page.waitForTimeout(1600);
  await shot('08-cay-trong');
  await page.fill('#empty-name', 'Trần Văn Khởi');
  await page.keyboard.press('Enter');
  await settle();
  check('cây mới: trồng người đầu tiên', (await cardCount()) === 1 && (await card('Trần Văn Khởi').count()) === 1);
  check('cây mới: tên cây trên thanh trên', (await page.textContent('#tree-name')) === 'Họ Trần');

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
  const mc = mp.locator('.card', { has: mp.locator('.nm', { hasText: /^Nguyễn Thị Lan$/ }) });
  await mc.tap();
  await mp.waitForTimeout(1100);
  const sheet = await mp.locator('#panel').boundingBox();
  const mcb = await mc.boundingBox();
  check('điện thoại: chạm thẻ mở tấm chi tiết', sheet && sheet.y < 844 - 200, sheet && sheet.y.toFixed(0));
  check('điện thoại: thẻ đang chọn không bị tấm che', mcb && mcb.y + mcb.height <= sheet.y + 2, mcb && (mcb.y + mcb.height).toFixed(0) + ' / ' + sheet.y.toFixed(0));
  check('điện thoại: nút thêm con hiện quanh thẻ đang chọn', await mp.locator('.card.sel .qa-child').isVisible());
  const h0 = (await mp.locator('#panel').boundingBox()).height;
  await mp.locator('.sheet-grip').tap();
  await mp.waitForTimeout(500);
  const h1 = (await mp.locator('#panel').boundingBox()).height;
  check('điện thoại: chạm tay nắm thì tấm dưới mở cao hơn', h1 > h0 + 80, h0.toFixed(0) + ' → ' + h1.toFixed(0));
  await mp.locator('.pn-close').tap();
  await mp.waitForTimeout(500);
  check('điện thoại: có nút ☰ trên thanh trên', await mp.locator('#view-btn').isVisible());
  await mp.locator('#view-btn').tap();
  await mp.waitForSelector('.menu.in');
  check('điện thoại: menu ☰ có thu/mở theo đời và hướng dẫn', (await mp.locator('.menu button', { hasText: 'Hiện tới đời 2' }).count()) === 1 && (await mp.locator('.menu button', { hasText: 'Hướng dẫn' }).count()) === 1);
  await mp.locator('.menu button', { hasText: 'Vừa khung' }).tap();
  await mp.waitForTimeout(700);
  const cw = (await mp.locator('.card').first().boundingBox()).width;
  check('điện thoại: ⌖ lần đầu phóng vừa đọc (thẻ rộng ≥ 100px)', cw >= 100, cw.toFixed(0));
  await mp.locator('#zfit').tap();
  await mp.waitForTimeout(700);
  const cw2 = (await mp.locator('.card').first().boundingBox()).width;
  check('điện thoại: ⌖ lần hai thu toàn cảnh', cw2 < cw / 2, cw2.toFixed(0));
  await mp.screenshot({ path: path.join(SHOTS, '09-dien-thoai.png') });
  check('điện thoại: không lỗi trang', merrs.length === 0, merrs.join(' | '));
  await m.close();

  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.log(out.join('\n')); console.error(e); process.exit(1); });
