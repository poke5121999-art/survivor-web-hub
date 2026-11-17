// Xưởng VFX trên bản đã deploy, bằng trình duyệt thật, đăng nhập bot rc-bot-a.
// node test/vfx-studio-pages.js <job_id_đã_xong>      mở job, chơi, đổi màu, tải sprite sheet, xem Thư viện và Máy gen
// VFX_SUBMIT=1 node test/vfx-studio-pages.js <id>    thêm: gửi job mới có ảnh qua giao diện, chờ máy gen làm xong (tốn hạn mức)
const fs = require('fs'), os = require('os'), path = require('path');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);
const BASE = process.env.HUB_URL || 'https://poke5121999-art.github.io/survivor-web-hub/';
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'vfx-pages');
const PW_BOT = process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8').trim();
const JOB = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const litPixels = async (page) => { let best = -1; for (let i = 0; i < 20; i++) { best = Math.max(best, await litOnce(page)); await page.waitForTimeout(100); } return best; };
const litOnce = (page) => page.evaluate(() => {
  const cv = [...document.querySelectorAll('canvas')].filter((c) => c.offsetParent).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!cv) return -1;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) n++;
  return n;
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });

  await page.goto(BASE + 'login.html?next=vfx.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#login-form input[name=email]', 'rc-bot-a@rc-bot.example.com');
  await page.fill('#login-form input[name=password]', PW_BOT);
  await page.click('#login-form button[type=submit]');
  await page.waitForURL(/vfx\.html/, { timeout: 60000 });
  await page.waitForSelector('[data-tab=new]', { timeout: 30000 });
  ok(true, 'đăng nhập bot rồi về vfx.html');

  await page.goto(BASE + 'vfx.html#job=' + JOB, { timeout: 60000 });
  await page.waitForFunction(() => /Xong/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const lit = await litPixels(page);
  ok(lit > 50, `player vẽ effect thật từ bundle trên Storage (${lit} điểm sáng)`);
  await page.screenshot({ path: path.join(OUT, 'job-done.png'), fullPage: true });

  const before = await page.evaluate(() => document.querySelector('canvas') && [...document.querySelectorAll('canvas')].map((c) => c.toDataURL().length).join());
  const ice = page.locator('button', { hasText: /^ice/ }).first();
  if (await ice.count()) { await ice.click(); await page.waitForTimeout(800); }
  ok(await ice.count() > 0, 'có nút đổi palette ice');

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator('button, a', { hasText: 'Sprite sheet PNG' }).first().click(),
  ]);
  const png = path.join(OUT, 'sheet.png');
  await dl.saveAs(png);
  const buf = fs.readFileSync(png);
  ok(buf.slice(1, 4).toString() === 'PNG' && buf.length > 1000, `tải sprite sheet PNG (${buf.length} B)`);

  await page.goto(BASE + 'vfx.html#lib', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#pane-lib canvas').length > 10, null, { timeout: 60000 });
  ok(true, `thư viện hiện ${await page.locator('#pane-lib canvas').count()} effect`);

  await page.goto(BASE + 'vfx.html#workers', { timeout: 60000 });
  await page.waitForFunction(() => /linux:claude/.test(document.body.innerText), null, { timeout: 30000 });
  const wtext = await page.locator('#pane-workers').innerText();
  ok(/linux:claude/.test(wtext) && !/linux:claude[\s\S]{0,200}Ngoại tuyến/i.test(wtext), 'tab Máy gen thấy linux:claude đang online');
  await page.screenshot({ path: path.join(OUT, 'workers.png'), fullPage: true });

  if (process.env.VFX_SUBMIT === '1') {
    await page.goto(BASE + 'vfx.html#new', { timeout: 60000 });
    await page.fill('#vx-prompt', 'Viên ngọc xanh lơ xoay nhẹ, lấp lánh, có quầng sáng nhịp thở, lặp liền mạch. Dùng cho vật phẩm nhặt được.');
    const img = path.join(OUT, 'ref.png');
    fs.writeFileSync(img, buf);
    await page.setInputFiles('input[type=file]', img);
    await page.waitForTimeout(1500);
    await page.locator('button', { hasText: 'Gửi cho máy gen' }).click();
    await page.waitForURL(/#job=/, { timeout: 60000 });
    const id = page.url().split('#job=')[1];
    ok(!!id, `gửi job qua giao diện: ${id}`);
    const t0 = Date.now();
    await page.waitForFunction(() => /Xong|Hỏng/.test(document.querySelector('#pane-detail')?.innerText || ''), null, { timeout: 30 * 60000, polling: 5000 });
    const txt = await page.locator('#pane-detail').innerText();
    ok(/Xong/.test(txt), `job mới xong sau ${Math.round((Date.now() - t0) / 1000)} s`);
    await page.waitForTimeout(2500);
    ok((await litPixels(page)) > 50, 'player chơi effect vừa gen');
    await page.screenshot({ path: path.join(OUT, 'job-new.png'), fullPage: true });
  }

  const real = errors.filter((e) => !/401|session/i.test(e));
  ok(real.length === 0, `không lỗi trang (${real.length}) ${real.slice(0, 5).join(' | ')}`);
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS', '· ảnh ở', OUT);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
