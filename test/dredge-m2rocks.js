/*
 * DREDGE — Biển Mù, vòng 7, đơn vị U2 m2rocks: đá ma (GhostRockManager, MONSTERS.md §2.3, hàng U2 của §3.3).
 *
 * Chạy:  node test/dredge-m2rocks.js          (ảnh: SHOTS=<thư mục>, mặc định <repo>/shots)
 * Kiểm:
 *   1. Dữ liệu: config literal của GhostRockConfig.asset (−0,2 / 0,75 / 0,85 / 0,15 / 10 / 25), bộ quản lý 60 s + 5 đá/khung,
 *      109 đá Marrows (59 nhỏ + 30 vừa + 20 lớn) + 35 Gale Cliffs (cờ, chưa dựng), 109 đá "GhostRocks (1)" không được quản lý.
 *   2. Sanity 0,8 ban đêm → 0 đá hiện (ngưỡng ≤ 0,75).
 *   3. Ngưỡng ép 0,75, sanity 0,5, ban đêm → đá cách 10–25 m hiện; không đá nào bật khi < 10 m (mọi lần bật ghi khoảng cách);
 *      đá trong 10 m vẫn ẩn; không đá nào ở > 25 m.
 *   4. Ban ngày (từ trạng thái sạch) → 0 đá; đang hiện rồi sang ngày → chỉ đá còn trong khung hình được giữ lại.
 *   5. Đâm một đá → +1 ô hỏng; cú thứ hai trong 1,5 s không thêm (miễn); thuyền được đẩy ra khỏi thân đá.
 *   6. Ảnh chụp đá trên màn hình 1280x720 và 844x390.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + '/games/dredge/index.html?fresh=1&t=0.9');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });
  await page.waitForFunction(() => window.DRGhostRocks && DRGhostRocks.debug.count() > 0, null, { timeout: 20000 });

  // ---- 1. dữ liệu
  const d1 = await page.evaluate(() => {
    const D = DR_GHOSTROCKS, c = D.config, m = D.rocks.filter(r => r.zone === 'THE_MARROWS');
    const cnt = n => m.filter(r => D.meshNames[r.mesh] === n).length;
    return { c, mg: D.manager, marrows: m.length, small: cnt('Marrows_SmallRockMesh_0'), med: cnt('Marrows_MediumRockMesh_0'), large: cnt('Marrows_LargeRockMesh_0'),
      gale: D.rocks.filter(r => r.zone === 'GALE_CLIFFS').length, unmanaged: D.unmanaged.count, built: DRGhostRocks.debug.count() };
  });
  check('GhostRockConfig: −0,2 / 0,75 / spawn 0,85 → 0,15 / 10 / 25 m', d1.c.sanityThresholdMin === -0.2 && d1.c.sanityThresholdMax === 0.75 && d1.c.spawnStartTime === 0.85 &&
    d1.c.spawnEndTime === 0.15 && d1.c.minDistanceThreshold === 10 && d1.c.maxDistanceThreshold === 25, JSON.stringify(d1.c));
  check('GhostRockManager: 60 s / 5 đá mỗi khung', d1.mg.timeBetweenSanityAssignments === 60 && d1.mg.rocksToCheckPerFrame === 5, JSON.stringify(d1.mg));
  check('109 đá Marrows trong bộ quản lý (59 nhỏ, 30 vừa, 20 lớn), 35 Gale Cliffs cờ, 109 không quản lý', d1.marrows === 109 && d1.small === 59 && d1.med === 30 && d1.large === 20 &&
    d1.gale === 35 && d1.unmanaged === 109, JSON.stringify(d1));
  check('đã dựng 109 đá Marrows (Gale hoãn)', d1.built === 109, String(d1.built));

  // ---- chọn chỗ đứng: tâm cụm đá dày nhất (nhiều đá trong 25 m) và cách đá gần nhất ≥ 12 m, trên nước
  const spot = await page.evaluate(() => {
    const R = DRGhostRocks.debug.rocks().map(r => r.d.p);
    let best = null;
    for (const a of R) for (let k = 0; k < 24; k++) {
      const ang = k / 24 * 6.2832, x = a[0] + Math.cos(ang) * 14, z = a[2] + Math.sin(ang) * 14;
      if (DR_DEBUG.sdf(x, z) < 8) continue;
      const ds = R.map(p => Math.hypot(p[0] - x, p[2] - z));
      if (Math.min(...ds) < 12) continue;
      const n = ds.filter(d => d <= 25).length;
      if (!best || n > best.n) best = { x, z, n, face: Math.atan2(-(a[0] - x), -(a[2] - z)) };
    }
    return best;
  });
  check('có chỗ đứng trên nước với đá trong 25 m', !!spot && spot.n >= 2, JSON.stringify(spot));
  const place = () => page.evaluate(s => { DR_DEBUG.teleport(s.x, s.z, s.face); const b = DR.s.boat; b.vx = b.vz = b.w = 0; DR.s.time = Math.floor(DR.s.time) + 0.9; }, spot);

  // ---- 2. sanity 0,8 ban đêm
  await place();
  const t2 = await page.evaluate(() => {
    DRGhostRocks.finish(); DRGhostRocks.debug.reroll();
    DR.s.sanity = 0.8; DRGhostRocks.debug.sweep(120);
    return { vis: DRGhostRocks.debug.visible(), tod: DR.s.time % 1, th: Math.max(...DRGhostRocks.debug.rocks().map(r => r.threshold)) };
  });
  check('sanity 0,8, đêm (giờ 0,9): 0 đá hiện (ngưỡng tối đa ' + t2.th.toFixed(3) + ' < 0,8)', t2.vis === 0 && t2.th <= 0.75, JSON.stringify(t2));

  // ---- 3. ngưỡng ép 0,75, sanity 0,5, đêm
  await page.evaluate(() => { DRGhostRocks.finish(); DRGhostRocks.debug.clearPopped(); DRGhostRocks.debug.reroll(); });
  await place();
  const t3 = await page.evaluate(() => {
    const dbg = DRGhostRocks.debug;
    DR.s.sanity = 0.5; DRGhostRocks.debug.sweep(1);      // bốc ngưỡng lần đầu, rồi ép 0,75
    dbg.forceThreshold(0.75);
    dbg.sweep(120);
    const b = DR.s.boat, R = dbg.rocks();
    const d3 = r => Math.hypot(r.d.p[0] - b.x, r.d.p[1], r.d.p[2] - b.z);
    const near = R.filter(r => d3(r) < 10), mid = R.filter(r => d3(r) >= 10 && d3(r) <= 25), far = R.filter(r => d3(r) > 25);
    return { vis: dbg.visible(), popped: dbg.popped(), nearShown: near.filter(r => r.showing).length, near: near.length, mid: mid.length, midShown: mid.filter(r => r.showing).length,
      farShown: far.filter(r => r.showing).length, tod: DR.s.time % 1 };
  });
  check('ngưỡng 0,75, sanity 0,5, đêm: mọi đá cách 10–25 m đều hiện (' + t3.midShown + '/' + t3.mid + ')', t3.mid >= 2 && t3.midShown === t3.mid, JSON.stringify(t3));
  check('không đá nào bật khi < 10 m (' + t3.popped.length + ' lần bật, nhỏ nhất ' + Math.min(...t3.popped) + ' m); đá trong 10 m (' + t3.near + ') vẫn ẩn; > 25 m ẩn',
    t3.popped.length > 0 && Math.min(...t3.popped) >= 10 && t3.nearShown === 0 && t3.farShown === 0, JSON.stringify({ popped: t3.popped.slice(0, 12), nearShown: t3.nearShown, farShown: t3.farShown }));

  // ---- 4. ban ngày: từ trạng thái sạch → 0; đang hiện rồi sang ngày → chỉ giữ đá còn trong khung hình
  const t4 = await page.evaluate(() => {
    const dbg = DRGhostRocks.debug;
    const before = dbg.visible();
    DR.s.time = Math.floor(DR.s.time) + 0.5;          // ngày
    dbg.sweep(120);
    const keep = dbg.rocks().filter(r => r.showing), allOnScreen = keep.every(r => dbg.onScreen(r));
    const hid = dbg.rocks().filter(r => !r.showing && r.mesh.visible).length;
    DRGhostRocks.finish(); dbg.sweep(120);
    return { before, afterDay: keep.length, allOnScreen, hid, fresh: dbg.visible() };
  });
  check('ban ngày từ trạng thái sạch: 0 đá hiện', t4.fresh === 0, JSON.stringify(t4));
  check('đang hiện (' + t4.before + ') rồi sang ngày: đá còn lại (' + t4.afterDay + ') đều còn trong khung hình (ẩn chỉ khi ra khỏi màn hình)', t4.allOnScreen, JSON.stringify(t4));

  // ---- 5. đâm một đá
  await page.evaluate(() => { DRGhostRocks.finish(); DRGhostRocks.debug.reroll(); });
  await place();
  await page.evaluate(() => { const dbg = DRGhostRocks.debug; DR.s.sanity = 0.5; dbg.sweep(1); dbg.forceThreshold(0.75); dbg.sweep(120); });
  // dò đá có bao lồi: ép tính bao qua một cú va giả; chọn đá có hull bằng cách đặt thuyền vào tâm từng đá hiện
  const t5 = await page.evaluate(async () => {
    const dbg = DRGhostRocks.debug, R = dbg.rocks().filter(r => r.showing), inv = () => DR.grid('INVENTORY').damage.length;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let tried = 0;
    for (const r of R) {
      // tâm đá trên mặt phẳng XZ; thuyền đặt trực tiếp lên đó, đứng yên, chờ một khung
      tried++;
      const b = DR.s.boat, before = inv();
      DR_DEBUG.teleport(r.d.p[0], r.d.p[2], 0); b.vx = b.vz = b.w = 0;
      await sleep(120);
      const after = inv();
      if (after > before) {
        const hitsAt = dbg.hits();
        // cú thứ hai trong 1,5 s: đặt lại vào đá, không thêm ô hỏng
        DR_DEBUG.teleport(r.d.p[0], r.d.p[2], 0); b.vx = b.vz = b.w = 0; r.touching = false;
        await sleep(120);
        const after2 = inv();
        // đã bị đẩy ra khỏi đá?
        await sleep(300);
        const moved = Math.hypot(b.x - r.d.p[0], b.z - r.d.p[2]);
        return { ok: true, tried, name: r.d.n, before, after, after2, hits: dbg.hits(), moved: +moved.toFixed(2), hitsAt };
      }
    }
    return { ok: false, tried, n: R.length };
  });
  check('đâm một đá: +1 ô hỏng (hộp INVENTORY.damage ' + (t5.before) + ' → ' + t5.after + ')', t5.ok && t5.after - t5.before === 1, JSON.stringify(t5));
  check('cú thứ hai trong 1,5 s không thêm (miễn); thuyền bị đẩy ra khỏi tâm đá', t5.ok && t5.after2 === t5.after && t5.moved > 0.3, JSON.stringify(t5));

  // ---- 6. ảnh chụp: có đá / không đá (cùng chỗ, cùng giờ) và đếm điểm ảnh khác nhau ở dải nước phía trước thuyền
  async function setup(on) {
    await page.evaluate(() => { DRGhostRocks.finish(); DRGhostRocks.debug.reroll(); });
    await place();
    await page.evaluate(on => { DR.s.sanity = on ? 0.5 : 1; DRGhostRocks.debug.sweep(1); if (on) DRGhostRocks.debug.forceThreshold(0.75); DRGhostRocks.debug.sweep(120); }, on);
    await sleep(2000);
    await page.evaluate(on => { DR.s.sanity = on ? 0.5 : 1; DR.s.time = Math.floor(DR.s.time) + 0.9; }, on);
    await sleep(600);
    return page.evaluate(() => ({ vis: DRGhostRocks.debug.visible(), d: DRGhostRocks.debug.visibleDists() }));
  }
  async function diffPx(a, b, w, h) {
    return page.evaluate(async ([a, b, w, h]) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
      const px = async src => { const i = await load(src), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
      const A = await px(a), B = await px(b); let n = 0;
      const x0 = Math.round(w * 0.15), x1 = Math.round(w * 0.9), y0 = Math.round(h * 0.42), y1 = Math.round(h * 0.66);   // dải nước phía trước thuyền, dưới hộp hướng dẫn
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 18) n++; }
      return n;
    }, [a, b, w, h]);
  }
  async function shot(name, w, h) {
    await page.setViewportSize({ width: w, height: h });
    const on = await setup(true);
    const bOn = await page.screenshot({ path: path.join(SHOTS, name) });
    const off = await setup(false);
    const bOff = await page.screenshot({ path: path.join(SHOTS, name.replace('.png', '-no-rocks.png')) });
    return { on, off: off.vis, px: await diffPx(bOn.toString('base64'), bOff.toString('base64'), w, h) };
  }
  const s1 = await shot('m2rocks-1280x720.png', 1280, 720);
  const s2 = await shot('m2rocks-844x390.png', 844, 390);
  check('ảnh 1280x720: ' + s1.on.vis + ' đá hiện, ảnh không đá khác ở ' + s1.px + ' điểm ảnh (dải nước)', s1.on.vis > 0 && s1.off === 0 && s1.px > 800, JSON.stringify(s1));
  check('ảnh 844x390: ' + s2.on.vis + ' đá hiện, ảnh không đá khác ở ' + s2.px + ' điểm ảnh (dải nước)', s2.on.vis > 0 && s2.off === 0 && s2.px > 300, JSON.stringify(s2));
  check('không có lỗi console / trang', errors.length === 0, errors.slice(0, 4).join(' | '));

  console.log(out.join('\n'));
  console.log('\nm2rocks: ' + pass + ' đạt, ' + fail + ' hỏng.  Ảnh: ' + SHOTS);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
