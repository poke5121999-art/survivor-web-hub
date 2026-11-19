// Tab "Job của đội" trên bản đã deploy: chia trang + nút xoá. Đăng nhập bot rc-bot-a bằng trình duyệt thật.
// node test/vfx-studio-jobs-pages.js
//   PLAYWRIGHT_PATH=<thư mục playwright-core>  CHROME=<chrome thật, tuỳ chọn>  SHOTS=<thư mục ảnh>  HUB_URL=<gốc hub>
// Tạo một job nháp (only_worker máy không có thật, huỷ ngay nên không máy gen nào nhận), xoá nó qua giao diện,
// rồi kiểm job và ảnh tham khảo của nó không còn.
const fs = require('fs'), os = require('os'), path = require('path');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);
const BASE = process.env.HUB_URL || 'https://poke5121999-art.github.io/survivor-web-hub/';
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'vfx-jobs-pages');
const BOT_PW = process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8').trim();
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
const SB = cfgSrc.match(/url: "([^"]+)"/)[1], ANON = cfgSrc.match(/anonKey: "([^"]+)"/)[1];
const FN = `${SB}/functions/v1/vfx-studio`;
const SIZE = 30;
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

async function botToken() {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'rc-bot-a@rc-bot.example.com', password: BOT_PW }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`bot login failed: ${JSON.stringify(j)}`);
  return j.access_token;
}

(async () => {
  const tok = await botToken();
  const api = async (b) => { const r = await fetch(FN, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };

  // job nháp có ảnh tham khảo, huỷ ngay để nó nằm đầu trang 1 với trạng thái Đã huỷ (xoá được)
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005d2b3f3e0000000049454e44ae426082', 'hex');
  const up = await api({ action: 'upload_urls', files: [{ name: 'xoa-thu.png', type: 'image/png', size: png.length }] });
  await fetch(up.body.files[0].uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png });
  const sub = await api({ action: 'submit', prompt: 'test giao diện: job nháp để thử nút xoá', title: 'TEST xoá qua giao diện', refs: [{ path: up.body.files[0].path, kind: 'image', name: 'mẫu' }], params: { only_worker: 'test:khong-co-may-nay' } });
  const tmpId = sub.body.job.id;
  await api({ action: 'cancel', id: tmpId });
  ok((await fetch(up.body.files[0].publicUrl)).ok, `job nháp ${tmpId} có ảnh tham khảo trên Storage`);

  const all = [];
  const first = (await api({ action: 'list', page: 1, page_size: 100 })).body;
  all.push(...first.jobs);
  for (let p = 2; p <= first.pages; p++) all.push(...(await api({ action: 'list', page: p, page_size: 100 })).body.jobs);
  const TOTAL = first.total, PAGES = Math.ceil(TOTAL / SIZE), oldest = all[all.length - 1];
  console.log(`API: ${TOTAL} job, cũ nhất ${oldest.id} (${oldest.created_at})`);

  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console ' + m.text()); });
  page.on('dialog', (d) => { page.lastDialog = d.message(); d.accept(); });

  await page.goto(BASE + 'login.html?next=vfx.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#login-form input[name=email]', 'rc-bot-a@rc-bot.example.com');
  await page.fill('#login-form input[name=password]', BOT_PW);
  await page.click('#login-form button[type=submit]');
  await page.waitForURL(/vfx\.html/, { timeout: 60000 });
  await page.waitForSelector('[data-tab=jobs]', { timeout: 30000 });

  await page.click('[data-tab=jobs]');
  const info = () => page.locator('.vx-pager__info').innerText();
  await page.waitForSelector('.vx-pager__info', { timeout: 30000 });
  await page.locator('#pane-jobs .vx-seg button', { hasText: 'Tất cả' }).click();
  await page.waitForFunction(() => /^Trang 1\//.test(document.querySelector('.vx-pager__info')?.innerText || ''), null, { timeout: 30000 });
  const t1 = await info();
  const m = t1.match(/Trang (\d+)\/(\d+) · tổng (\d+) job/);
  ok(m && +m[2] === Math.ceil(+m[3] / SIZE) && Math.abs(+m[3] - TOTAL) <= 2, `"${t1}": số trang = ceil(tổng/30), tổng khớp API (${TOTAL})`);
  const N = +m[2], T = +m[3];
  ok(await page.locator('#pane-jobs .vx-cardwrap').count() === Math.min(SIZE, T), `trang 1 có ${await page.locator('#pane-jobs .vx-cardwrap').count()} thẻ`);
  ok(await page.locator('.vx-pager__b[aria-current=page]').innerText() === '1', 'nút trang 1 được tô là trang đang xem');
  await page.screenshot({ path: path.join(OUT, 'jobs-page1.png'), fullPage: true });

  // nút xoá: chỉ trên job của mình và không đang chạy
  const wrong = await page.evaluate(() => {
    const S = window.__vfx, bad = [];
    for (const w of document.querySelectorAll('#pane-jobs .vx-cardwrap')) {
      const j = S.jobs.find((x) => x.id === w.dataset.job), has = !!w.querySelector('.vx-card__del');
      const may = (j.created_by === S.me.id || S.me.isAdmin) && j.status !== 'queued' && j.status !== 'running';
      if (has !== may) bad.push(j.id);
    }
    return bad;
  });
  ok(wrong.length === 0, `nút Xoá chỉ hiện trên job của mình, không đang chạy (lệch ${wrong.length})`);

  // trang 2
  await page.locator('.vx-pager__b', { hasText: /^2$/ }).click();
  await page.waitForFunction(() => /^Trang 2\//.test(document.querySelector('.vx-pager__info')?.innerText || ''), null, { timeout: 30000 });
  ok(/#jobs=2$/.test(page.url()), `trang 2 ghi vào URL (${page.url().split('#')[1]})`);
  const ids2 = await page.$$eval('#pane-jobs .vx-cardwrap', (w) => w.map((x) => x.dataset.job));
  ok(ids2.every((id) => !all.slice(0, Math.max(0, SIZE - 2)).some((j) => j.id === id)), 'trang 2 không lặp job của trang 1');

  // trang cuối: job cũ nhất phải có mặt
  await page.locator('.vx-pager__b[title="Trang cuối"]').click();
  await page.waitForFunction((n) => document.querySelector('.vx-pager__info')?.innerText.startsWith(`Trang ${n}/`), N, { timeout: 30000 });
  const idsL = await page.$$eval('#pane-jobs .vx-cardwrap', (w) => w.map((x) => x.dataset.job));
  ok(idsL.length === T - (N - 1) * SIZE, `trang cuối ${N} có ${idsL.length} thẻ = ${T} - ${(N - 1) * SIZE}`);
  ok(idsL[idsL.length - 1] === oldest.id, `job cũ nhất (${oldest.created_at.slice(0, 10)}) nằm cuối trang cuối`);
  await page.screenshot({ path: path.join(OUT, 'jobs-last-page.png'), fullPage: true });

  // làm mới, vào chi tiết rồi quay lại: vẫn ở trang cuối
  await page.locator('#pane-jobs button', { hasText: 'Làm mới' }).click();
  await page.waitForTimeout(2500);
  ok((await info()).startsWith(`Trang ${N}/`), 'bấm Làm mới vẫn ở trang cuối');
  await page.locator('#pane-jobs .vx-card').first().click();
  await page.waitForSelector('#pane-detail .vx-back', { timeout: 30000 });
  await page.locator('#pane-detail .vx-back').click();
  await page.waitForFunction((n) => document.querySelector('.vx-pager__info')?.innerText.startsWith(`Trang ${n}/`) && !document.querySelector('#pane-jobs').hidden, N, { timeout: 30000 });
  ok(true, 'vào chi tiết một job rồi bấm "← Danh sách job" vẫn về trang cuối');
  await page.waitForTimeout(6000);
  ok((await info()).startsWith(`Trang ${N}/`), 'sau 6 s (vòng tự làm mới 5 s) vẫn ở trang cuối');

  // Của tôi: về trang 1, tổng theo người gửi
  await page.locator('#pane-jobs .vx-seg button', { hasText: 'Của tôi' }).click();
  await page.waitForFunction(() => /^Trang 1\//.test(document.querySelector('.vx-pager__info')?.innerText || ''), null, { timeout: 30000 });
  const mine = (await api({ action: 'list', mine: true, page_size: SIZE })).body.total;
  ok((await info()).includes(`tổng ${mine} job`), `Của tôi về trang 1, "${await info()}" (API ${mine})`);

  // xoá job nháp từ thẻ của nó
  const card = page.locator(`#pane-jobs .vx-cardwrap[data-job="${tmpId}"]`);
  await card.waitFor({ timeout: 30000 });
  await card.locator('.vx-card__del').click();
  await page.waitForFunction((id) => !document.querySelector(`[data-job="${id}"]`), tmpId, { timeout: 30000 });
  ok(/Xoá VFX này\? Không khôi phục được\./.test(page.lastDialog || ''), `hỏi lại trước khi xoá ("${(page.lastDialog || '').split('\n')[0]}")`);
  await page.waitForSelector('text=Đã xoá VFX', { timeout: 10000 }).then(() => ok(true, 'toast "Đã xoá VFX"'), () => ok(false, 'toast "Đã xoá VFX"'));
  ok((await api({ action: 'get', id: tmpId })).status === 404, 'job nháp không còn trên máy chủ');
  const st = (await fetch(up.body.files[0].publicUrl + '?t=' + Date.now())).status;
  ok(st >= 400, `ảnh tham khảo của job nháp đã xoá khỏi Storage (${st})`);
  await page.waitForTimeout(1500);
  ok((await info()).includes(`tổng ${mine - 1} job`), `tổng giảm còn ${mine - 1} ("${await info()}")`);

  // điện thoại: thanh trang không tràn ngang
  await page.locator('#pane-jobs .vx-seg button', { hasText: 'Tất cả' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate((n) => { location.hash = '#jobs=' + n; }, Math.min(3, N));
  await page.waitForFunction((n) => document.querySelector('.vx-pager__info')?.innerText.startsWith('Trang ' + n + '/'), Math.min(3, N), { timeout: 30000 });
  const over = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth, row: document.querySelector('.vx-pager__row').getBoundingClientRect().height }));
  ok(over.doc <= over.win && over.row < 60, `điện thoại 390px: không cuộn ngang (${over.doc}/${over.win}), thanh trang một hàng (${Math.round(over.row)} px)`);
  await page.locator('.vx-pager').screenshot({ path: path.join(OUT, 'pager-phone.png') });

  ok(errors.length === 0, `không lỗi trang (${errors.length}) ${errors.slice(0, 5).join(' | ')}`);
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS', '· ảnh ở', OUT);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
