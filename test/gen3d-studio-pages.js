// Xưởng 3D bằng trình duyệt thật, phục vụ thư mục repo qua server tĩnh tự mở trên localhost (CORS của function nhận localhost).
//   node test/gen3d-studio-pages.js            ?mock=1: config popup, model, Máy gen, Thử anim trên Xbot (không cần backend)
//   GEN3D_E2E=1 node test/gen3d-studio-pages.js  đăng nhập bot rc-bot-a, gửi ảnh từ trang, chờ máy gen (worker.py --fake phải đang chạy),
//                                               bấm Gen xương, mở Thử anim. Ảnh chụp ở SHOTS (mặc định %TEMP%/gen3d-pages).
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'gen3d-pages');
const E2E = process.env.GEN3D_E2E === '1';
fs.mkdirSync(OUT, { recursive: true });

let fails = 0, passes = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (c) passes++; else fails++; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
// điểm ảnh khác nền trong canvas WebGL (đọc qua toDataURL vì preserveDrawingBuffer)
const busyPixels = (page, sel) => page.evaluate(async (sel) => {
  const cv = document.querySelector(sel);
  const img = new Image(); img.src = cv.toDataURL('image/png'); await img.decode();
  const c = document.createElement('canvas'); c.width = 160; c.height = 100;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 100);
  const d = g.getImageData(0, 0, 160, 100).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && Math.abs(d[i] - d[i + 2]) + Math.abs(d[i + 1] - d[i + 2]) > 25 || d[i] > 150) n++;
  return n;
}, sel);

(async () => {
  const srv = await serve();
  const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console ' + m.text()); });
  page.setDefaultTimeout(60000);
  try {
    if (!E2E) {
      await page.goto(BASE + 'gen3d.html?mock=1');
      await page.waitForSelector('a.g3-asset');
      ok(await page.locator('a.g3-asset').count() >= 4 && await page.locator('.g3-asset--up').count() === 1, `Assets có ô Upload 3D Model và ${await page.locator('a.g3-asset').count()} model mẫu`);
      await page.locator('.g3-row', { hasText: 'Geometry & Texture' }).click();
      await page.waitForSelector('dialog.g3-cfg[open]');
      const toggles = await page.locator('dialog.g3-cfg input.g3-toggle').count();
      ok(toggles === 5, `panel có 5 công tắc (Ultra, AI Complete, Texture, Remove Lighting, PBR): ${toggles}`);
      await page.locator('dialog.g3-cfg .g3-help').first().hover();
      ok(/marching cubes/.test(await page.locator('.g3-tip').innerText()), 'dấu ? hiện tooltip tiếng Việt');
      await page.locator('dialog.g3-cfg button', { hasText: 'Quad' }).click();
      await page.fill('dialog.g3-cfg .g3-poly > input', '250000');
      await page.locator('dialog.g3-cfg .g3-poly > input').dispatchEvent('change');
      await page.screenshot({ path: path.join(OUT, 'mock-config.png') });
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gen3d.cfg.v1')));
      ok(saved.topology === 'quad' && saved.polycount === 250000, 'cài đặt lưu localStorage (quad, 250000)');
      await page.locator('dialog.g3-cfg .g3-cfg__x').click();
      ok(!(await page.locator('dialog.g3-cfg').evaluate((d) => d.open)), 'nút × đóng panel Geometry & Texture');
      await page.goto(BASE + 'gen3d.html?mock=1');
      await page.locator('.g3-row', { hasText: 'Geometry & Texture' }).click();
      ok(await page.locator('dialog.g3-cfg .g3-poly > input').inputValue() === '250000', 'nạp lại trang vẫn nhớ polycount');
      await page.locator('dialog.g3-cfg .g3-cfg__x').click();
      await page.locator('.g3-rail__btn[data-tool=texture]').click();
      ok(await page.locator('.g3-emptytool .g3-upbtn').count() === 1, 'Texture chưa chọn model: trạng thái trống có nút Upload 3D Model');
      await page.screenshot({ path: path.join(OUT, 'mock-texture-empty.png') });
      const obj = path.join(OUT, 'tam-giac.obj');
      fs.writeFileSync(obj, 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 3 4\nf 1 4 2\nf 2 4 3\n');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.g3-emptytool .g3-upbtn').click()]);
      await chooser.setFiles(obj);
      await page.waitForFunction(() => window.__gen3d.S.job && window.__gen3d.S.job.params.source === 'upload' && window.__gen3d.viewer.loaded, null, { timeout: 60000 });
      ok(true, 'tải OBJ lên: đổi sang glb trong trình duyệt, ra model source upload, hiện trong viewport');
      ok(!(await page.locator('.g3-go button', { hasText: 'Gen texture' }).isDisabled()), 'model tải lên gen texture được');
      await page.locator('.g3-rail__btn[data-tool=model]').click();

      // gửi ảnh qua giao diện (mock): Nhiều góc, 2 ảnh
      const png = path.join(OUT, 'front.png');
      fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQ0lEQVR42u3OMQ0AAAgDoL9/aVcDOwSStpNLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOy3ArgAAV8BnVEAAAAASUVORK5CYII=', 'base64'));
      await page.locator('.g3-tabs2 button', { hasText: 'Nhiều góc' }).click();
      await page.setInputFiles('.g3-slot[data-view=front] input[type=file]', png);
      await page.setInputFiles('.g3-slot[data-view=left] input[type=file]', png);
      await page.waitForSelector('.g3-slot[data-view=left] img');
      await page.screenshot({ path: path.join(OUT, 'mock-multiview.png') });
      await page.fill('.g3-left input.g3-input', 'Hộp thử');
      await page.locator('.g3-go button', { hasText: 'Generate' }).click();
      await page.waitForURL(/#job=mock-/);
      await page.waitForFunction(() => document.querySelector('.g3-rtabs [aria-selected=true]')?.textContent === 'Property');
      await page.waitForFunction(() => window.__gen3d.S.chain.some((j) => j.kind === 'texture' && j.status === 'done'), null, { timeout: 40000 });
      ok(true, 'gửi shape bật Texture: mock tự ra texture con và xong');

      await page.goto(BASE + 'gen3d.html?mock=1#job=seed-texture');
      await page.waitForFunction(() => window.__gen3d.viewer.loaded, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      ok((await busyPixels(page, '.g3-cv')) > 300, 'viewport vẽ model texture');
      const stats = await page.locator('.g3-stats').innerText();
      ok(/Faces[\s\S]*\d/.test(stats), `góc phải có Topology/Faces/Vertices (${stats.replace(/\s+/g, ' ')})`);
      ok(await page.locator('.g3-tree li').count() === 3, 'Property có cây 3 phiên bản shape → texture → rig');
      ok(!(await page.locator('.g3-tb', { hasText: 'Gen texture' }).isDisabled()) && !(await page.locator('.g3-tb', { hasText: 'Gen xương' }).isDisabled()), 'bản texture: bấm được Gen texture và Gen xương');
      await page.screenshot({ path: path.join(OUT, 'mock-texture.png') });
      await page.locator('.g3-mode[title="Lưới (wireframe)"]').click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, 'mock-wire.png') });

      await page.goto(BASE + 'gen3d.html?mock=1#job=seed-rig');
      await page.waitForFunction(() => window.__gen3d.viewer.loaded, null, { timeout: 60000 });
      ok(await page.locator('a.g3-tb--link', { hasText: 'Thử anim' }).count() === 1, 'bản rig có link Thử anim');
      await page.locator('.g3-rail__btn[data-tool=workers]').click();
      await page.waitForSelector('.g3-worker');
      ok(/Thiếu RAM\/VRAM/.test(await page.locator('.g3-workers').innerText()), 'Máy gen hiện caps, gpu và trạng thái lowmem');
      await page.screenshot({ path: path.join(OUT, 'mock-workers.png') });

      await page.goto(BASE + 'gen3d-anim.html?mock=1&job=seed-rig');
      await animCheck(page, 'mock-anim.png');
    } else {
      await e2e(page, BASE);
    }
  } catch (e) {
    ok(false, 'lỗi: ' + e.message.split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  }
  const real = errors.filter((e) => !/favicon|cloudfront/i.test(e));
  ok(real.length === 0, `không lỗi trang (${real.length}) ${real.slice(0, 4).join(' | ')}`);
  await browser.close();
  srv.close();
  console.log(fails ? `${passes} PASS, ${fails} FAIL` : `ALL PASS (${passes})`, '· ảnh ở', OUT);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

async function animCheck(page, shot) {
  await page.waitForFunction(() => window.__anim && window.__anim.tracks > 20, null, { timeout: 90000 });
  const a = await page.evaluate(() => window.__anim);
  ok(a.tracks > 20, `clip "${a.clip}" gắn ${a.tracks} track vào xương của model`);
  const n = await page.locator('.ga-item').count();
  ok(n > 10, `danh sách anim có ${n} mục`);
  await page.fill('#ga-q', 'walk');
  const walk = page.locator('.ga-item', { hasText: /walk/i }).first();
  await walk.click();
  await page.waitForFunction(() => /walk/i.test(window.__anim.clip), null, { timeout: 60000 });
  const t1 = await page.locator('#ga-time').innerText();
  await page.waitForTimeout(1200);
  const t2 = await page.locator('#ga-time').innerText();
  ok(t1 !== t2, `anim đang chạy (${t1} → ${t2})`);
  ok((await busyPixels(page, '.g3-cv')) > 300, 'khung anim vẽ model');
  await page.screenshot({ path: path.join(OUT, shot) });
}

async function e2e(page, BASE) {
  const pw = process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8').trim();
  await page.goto(BASE + 'login.html?next=gen3d.html');
  await page.fill('#login-form input[name=email]', 'rc-bot-a@rc-bot.example.com');
  await page.fill('#login-form input[name=password]', pw);
  await page.click('#login-form button[type=submit]');
  await page.waitForURL(/gen3d\.html/);
  await page.waitForSelector('.g3-slot');
  ok(true, 'đăng nhập bot rồi về gen3d.html');
  await page.evaluate(() => localStorage.setItem('gen3d.cfg.v1', JSON.stringify({ texture: false, topology: 'triangle', polycount: 8000 })));
  await page.reload();
  await page.locator('.g3-tabs2 button', { hasText: 'Một ảnh' }).click();
  await page.setInputFiles('.g3-slot[data-view=front] input[type=file]', process.env.GEN3D_IMG || path.join(ROOT, 'assets', 'thumbnails', fs.readdirSync(path.join(ROOT, 'assets', 'thumbnails')).find((f) => f.endsWith('.png'))));
  await page.waitForSelector('.g3-slot[data-view=front] img');
  await page.fill('.g3-left input.g3-input', 'E2E fake worker');
  await page.locator('.g3-go button', { hasText: 'Generate' }).click();
  await page.waitForURL(/#job=/);
  const id = page.url().split('#job=')[1];
  ok(!!id, `gửi shape từ trang: ${id}`);
  const t0 = Date.now();
  await page.waitForFunction(() => window.__gen3d.S.job && window.__gen3d.S.job.status === 'done' && window.__gen3d.viewer.loaded, null, { timeout: 10 * 60000, polling: 2000 });
  ok(true, `shape xong và hiện trong viewport sau ${Math.round((Date.now() - t0) / 1000)} s`);
  await page.screenshot({ path: path.join(OUT, 'e2e-shape.png') });
  await page.locator('.g3-tb', { hasText: 'Gen xương' }).click();
  await page.waitForFunction((id) => window.__gen3d.S.job && window.__gen3d.S.job.kind === 'rig' && window.__gen3d.S.job.parent_id === id, id, { timeout: 60000 });
  const t1 = Date.now();
  await page.waitForFunction(() => window.__gen3d.S.job.status === 'done' && window.__gen3d.viewer.loaded, null, { timeout: 10 * 60000, polling: 2000 });
  ok(true, `rig xong sau ${Math.round((Date.now() - t1) / 1000)} s`);
  ok(await page.locator('.g3-tree li').count() === 2, 'Property: chuỗi shape → rig');
  await page.screenshot({ path: path.join(OUT, 'e2e-rig.png') });
  await page.locator('a.g3-tb--link', { hasText: 'Thử anim' }).click();
  await page.waitForURL(/gen3d-anim\.html\?job=/);
  await animCheck(page, 'e2e-anim.png');
}
