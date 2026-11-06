/*
 * DREDGE — Biển Mù, w8paint (WORLD-GAPS.md §6 W8): sơn thuyền, cờ, dây cờ, kiểu còi.
 * Nguồn: PlayerColorCustomizer.cs, DredgeDialogueRunner.cs:630-661 (ChangeBoatColor/Flag/Bunting/Horn), FoghornAbility.RefreshFoghornStyle.
 * Kiểm: ChangeBoatColor 1 3 -> màu vật liệu thân = hullColors[3] và ảnh nướng ở hàng thân đúng công thức albedo*(r*Roof+g*Hull+b*Base) tuyến tính;
 *   ChangeBoatColor 0 5 -> nóc = roofColors[5]; ChangeBoatFlag n -> FlagAccessory hiện + ảnh cờ n; Bunting; Horn lưu biến; nâng vỏ chưa đổi màu -> mặc định tier;
 *   đã đổi màu thì giữ; lưu/nạp giữ nguyên.
 * Chạy: node test/dredge-w8paint.js     Ảnh: SHOTS (mặc định %TEMP%/dredge-w8paint)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w8paint'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

(async () => {
  const srv = await new Promise(res => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b);
      });
    }).listen(0, () => res(s));
  });
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto((process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port) + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  for (let i = 0; i < 80; i++) {            // đi hết hội thoại tới khi giao diện bến hiện
    const s = await page.evaluate(() => {
      const d = DRDock._debug(), open = DRDialogue.isOpen();
      return { ready: !!d && d.phase === 'ui' && !open, st: open ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
  await page.evaluate(() => DR.setMode('sail')); await sleep(500);
  await page.evaluate(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await page.evaluate(() => DR_DEBUG.setTime(0.5));
  await sleep(3000);

  const run = line => page.evaluate(l => { const a = DRYarn.split(l); DRYarn.commands[a[0]].f(a.slice(1)); }, line);
  const hullMats = () => page.evaluate(() => DRPaint.mats.map(m => ({ n: m.userData.paintName, p: m.userData.paint })));
  const px = (name, x, y) => page.evaluate(([n, x, y]) => Array.from(DRPaint.baked[n].cv.getContext('2d').getImageData(x, y, 1, 1).data).slice(0, 3), [name, x, y]);
  const P = await page.evaluate(() => ({ roof: DR_PAINT.roof, hull: DR_PAINT.hull, nflags: DR_PAINT.flags.length }));
  ok(P.roof.length === 8 && P.hull.length === 8 && P.nflags === 7, 'bảng màu 8+8, 7 cờ: ' + P.roof.length + '/' + P.hull.length + '/' + P.nflags);
  // công thức gốc (LitBoat_Shader), tính độc lập với js/paint.js
  const expect = (name, x, y, roof, hull) => page.evaluate(([n, x, y, roof, hull]) => {
    const d = DR_PAINT.mats[n], lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4), sr = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    const A = Uint8Array.from(atob(d.albedo), c => c.charCodeAt(0)), M = Uint8Array.from(atob(d.mask), c => c.charCodeAt(0)), i = y * d.w + x, out = [];
    for (let c = 0; c < 3; c++) {
      const t = M[i * 3] / 255 * lin(roof[c]) + M[i * 3 + 1] / 255 * lin(hull[c]) + M[i * 3 + 2] / 255 * lin(d.base[c]);
      out.push(Math.round(sr(Math.min(1, lin(A[i * 4 + c] / 255) * t)) * 255));
    }
    return out;
  }, [name, x, y, roof, hull]);
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 1);

  // --- mặc định: tier 1, chỉ số 0/0
  let m0 = await hullMats();
  ok(m0.length >= 3 && m0.every(m => m.p && m.p.roofIndex === 0 && m.p.hullIndex === 0), 'mặc định roof/hull = chỉ số 0: ' + JSON.stringify(m0.map(m => m.p && [m.p.roofIndex, m.p.hullIndex])));
  const hullBefore = await px('SmallBoat_Mat', 2, 14), roofBefore = await px('SmallBoat_Mat', 2, 0), cabBefore = await px('SmallBoat_Mat', 0, 4);

  // --- ChangeBoatColor 1 3 (thân = hullColors[3])
  await run('ChangeBoatColor 1 3');
  const v1 = await page.evaluate(() => ({ h: DR.s.vars['hull-color-index'], ch: DR.s.vars['has-changed-boat-colors'] }));
  ok(v1.h === 3 && v1.ch === true, 'ChangeBoatColor 1 3 lưu hull-color-index=3 và has-changed-boat-colors: ' + JSON.stringify(v1));
  m0 = await hullMats();
  ok(m0.every(m => JSON.stringify(m.p.hull) === JSON.stringify(P.hull[3])), 'màu vật liệu thân = hullColors[3] ' + JSON.stringify(P.hull[3]) + ' ở ' + m0.length + ' vật liệu');
  ok(m0.every(m => JSON.stringify(m.p.roof) === JSON.stringify(P.roof[0])), 'nóc vẫn roofColors[0]');
  const hullAfter = await px('SmallBoat_Mat', 2, 14), roofAfter = await px('SmallBoat_Mat', 2, 0), cabAfter = await px('SmallBoat_Mat', 0, 4);
  ok(!same(hullBefore, hullAfter), 'ảnh thân đổi màu: ' + hullBefore + ' -> ' + hullAfter);
  ok(same(hullAfter, await expect('SmallBoat_Mat', 2, 14, P.roof[0], P.hull[3])), 'ảnh thân đúng công thức tuyến tính: ' + hullAfter);
  ok(same(roofBefore, roofAfter) && same(cabBefore, cabAfter), 'nóc và tường cabin (Base_Color trắng) không đổi: ' + roofAfter + ' ' + cabAfter);

  // --- ChangeBoatColor 0 5 (nóc = roofColors[5])
  await run('ChangeBoatColor 0 5');
  m0 = await hullMats();
  ok(m0.every(m => JSON.stringify(m.p.roof) === JSON.stringify(P.roof[5]) && JSON.stringify(m.p.hull) === JSON.stringify(P.hull[3])), 'nóc = roofColors[5], thân giữ hullColors[3]');
  ok(same(await px('SmallBoat_Mat', 2, 0), await expect('SmallBoat_Mat', 2, 0, P.roof[5], P.hull[3])), 'ảnh nóc đúng công thức');

  // --- cờ và dây cờ
  const acc = () => page.evaluate(() => ({ flag: DRPaint.accessories.flag.filter(o => o.visible).length, flagAll: DRPaint.accessories.flag.length, bunt: DRPaint.accessories.bunting.filter(o => o.visible).length, buntAll: DRPaint.accessories.bunting.length,
    style: DRPaint.flagMats.map(m => m.userData.flagStyle), tex: DRPaint.flagMats.every(m => !!m.map) }));
  let a = await acc();
  ok(a.flagAll === 5 && a.buntAll === 5, 'đủ 5 FlagAccessory + 5 BuntingAccessory (mỗi tier một): ' + JSON.stringify(a));
  ok(a.flag === 0 && a.bunt === 0, 'chưa chọn cờ / dây cờ thì ẩn');
  await run('ChangeBoatFlag 3'); await run('ChangeBoatBunting 1');
  await sleep(600);
  a = await acc();
  ok(a.flag === 5 && a.style.every(s => s === 3) && a.tex, 'ChangeBoatFlag 3: FlagAccessory hiện, ảnh cờ 3: ' + JSON.stringify(a));
  ok(a.bunt === 5, 'ChangeBoatBunting 1: BuntingAccessory hiện: ' + a.bunt);
  const ft = await page.evaluate(() => { const i = DRPaint.flagMats[0].map.image; return i ? [i.width, i.height] : null; });
  ok(ft && ft[0] === 256 && ft[1] === 256, 'ảnh cờ 256x256 đã nạp: ' + ft);
  const flagRef = await page.evaluate(() => DR_PAINT.flags[2].texture);
  ok(flagRef === 'BlueFishFlag_Texture', 'cờ 3 = BlueFishFlag_Texture: ' + flagRef);
  // camera quay 90 độ quanh thuyền để thấy mặt lá cờ (từ phía sau lá cờ chỉ còn là một nét mỏng)
  await page.evaluate(() => { DR_DEBUG.setTime(0.5); DRBoat.setLights(false); DRCamera.orbit(90, 0); });
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'repaint-1280x720.png') });
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(2000);
  await page.screenshot({ path: path.join(OUT, 'repaint-844x390.png') });
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(800);
  await run('ChangeBoatFlag 0'); await run('ChangeBoatBunting 0');
  a = await acc();
  ok(a.flag === 0 && a.bunt === 0, 'ChangeBoatFlag 0 / Bunting 0 ẩn lại: ' + JSON.stringify(a));

  // --- còi: biến foghorn-style-index mà js/abilities.js đọc khi bấm còi
  await run('ChangeBoatHorn 2');
  const horn = await page.evaluate(() => DR.s.vars['foghorn-style-index']);
  ok(horn === 2, 'ChangeBoatHorn 2 -> foghorn-style-index = 2: ' + horn);

  // --- lưu / nạp
  const saved = await page.evaluate(() => { DR.save(); const raw = JSON.parse(localStorage.getItem(DR.saveKey())); DR.s.vars['hull-color-index'] = 0; DR.load(); return [raw.vars['hull-color-index'], raw.vars['roof-color-index'], DR.s.vars['hull-color-index']]; });
  ok(saved[0] === 3 && saved[1] === 5 && saved[2] === 3, 'lưu/nạp giữ chỉ số sơn: ' + saved);
  m0 = await hullMats();
  ok(m0.every(m => m.p.hullIndex === 3 && m.p.roofIndex === 5), 'sau nạp vật liệu vẫn đúng chỉ số');

  // --- nâng vỏ: chưa đổi màu -> mặc định tier mới; đã đổi -> giữ
  const up = await page.evaluate(() => {
    const out = {};
    DR.s.vars['has-changed-boat-colors'] = true;
    DR.emit('upgrade', { id: 'x', kind: 'hull', tier: 3, hullTier: 3 });
    out.kept = [DR.s.vars['roof-color-index'], DR.s.vars['hull-color-index']];
    DR.s.vars['has-changed-boat-colors'] = false;
    DR.emit('upgrade', { id: 'x', kind: 'hull', tier: 3, hullTier: 3 });
    out.def = [DR.s.vars['roof-color-index'], DR.s.vars['hull-color-index']];
    out.want = [DR_PAINT.defRoof['3'], DR_PAINT.defHull['3']];
    out.mat = DRPaint.mats[0].userData.paint.roofIndex;
    return out;
  });
  ok(JSON.stringify(up.kept) === '[5,3]', 'đã đổi màu thì nâng vỏ giữ chỉ số: ' + up.kept);
  ok(JSON.stringify(up.def) === JSON.stringify(up.want) && up.want[0] === 2, 'chưa đổi màu: nâng vỏ tier 3 -> mặc định (2,2): ' + up.def + ' vs ' + up.want);
  ok(up.mat === up.want[0], 'vật liệu theo chỉ số mới');

  ok(errors.length === 0, 'khong co loi trang/console/HTTP: ' + errors.slice(0, 3).join(' | '));
  console.log('w8paint ' + pass + ' pass, ' + fail + ' fail  ->  ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
