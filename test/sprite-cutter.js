/*
 * Bàn Cắt Sprite trên hub (games/sprite-cutter): mở được, không gọi máy chủ ngoài, bấm cắt thì tải về .zip đủ frame.
 * Dùng:  node test/sprite-cutter.js        HUB_URL=https://poke5121999-art.github.io/survivor-web-hub node test/sprite-cutter.js
 * Bộ kiểm đầy đủ của công cụ nằm ở nguồn: sh ~/REPO_MOBI/notes/sprite-cutter/run-test.sh
 */
'use strict';
const path = require('path');
const T = require('../tools/thumb-lib.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

async function main() {
  const srv = process.env.HUB_URL ? { base: process.env.HUB_URL.replace(/\/$/, ''), close() {} } : await T.serve();
  const br = await T.browser();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [], outside = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  page.on('request', (r) => { if (!r.url().startsWith(srv.base) && !/^(data|blob):/.test(r.url())) outside.push(r.url()); });
  await page.goto(srv.base + '/games/sprite-cutter/index.html?v=test', { waitUntil: 'networkidle' });
  check('trang mở, đủ 8 frame mẫu', await page.evaluate(() => typeof S !== 'undefined' && frames().length) === 8);
  check('JSZip nạp từ vendor', await page.evaluate(() => typeof JSZip) === 'function');
  check('không gọi máy chủ ngoài', outside.length === 0, outside.join(' ') || null);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#btn-cut')]);
  const file = path.join(require('os').tmpdir(), 'sprite-cutter-hub-test.zip');
  await dl.saveAs(file);
  const names = await page.evaluate(async (b64) => Object.keys((await JSZip.loadAsync(b64, { base64: true })).files).sort(),
    require('fs').readFileSync(file).toString('base64'));
  check('bấm Cắt và lưu tải về slime_mau.zip', dl.suggestedFilename() === 'slime_mau.zip', dl.suggestedFilename());
  check('zip đủ 8 frame + sheet + json', names.length === 10 && names.includes('slime_mau_sheet.png') && names.includes('slime_mau.json'), names.length);
  check('báo đã tải', (await page.textContent('#status')) === 'Đã tải slime_mau.zip.', await page.textContent('#status'));
  check('không lỗi trang', problems.length === 0, problems.join(' | ') || null);
  await br.close(); srv.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
