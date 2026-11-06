/*
 * w2dock (round 5): cảnh bến theo clip 1050 / 192 — HUD ở bến (mặt đồng hồ + chip TAB, không tiền, không nút "Nhiệm vụ"),
 * thanh nợ chỉ hiện sau lời thoại Mayor_Intro_1_Fish, chip nhân vật góc trái dưới, thuyền hiện khi cập bến bằng F từ biển.
 * Chạy: node test/dredge-w2dock.js    Ảnh: SHOTS (mặc định %TEMP%/dredge-w2dock)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w2dock');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const ev = (page, f, a) => page.evaluate(f, a);

async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}
const ui = page => ev(page, () => {
  const q = s => document.querySelector(s), vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  return {
    money: !!q('#dr-dockui .dk-money'), progress: !!q('#dr-dockui .dk-progress'), progressTxt: q('#dr-dockui .dk-progress .v') && q('#dr-dockui .dk-progress .v').textContent,
    hud: vis(q('#dr-hud')) && q('#dr-hud').classList.contains('on'), clock: vis(q('#dr-hud .hud-tray')), bag: vis(q('#dr-hud .hud-bag')), jb: vis(q('.qn-jbtn')),
    speakers: [...document.querySelectorAll('#dr-dockui .dk-speaker')].map(b => ({ n: b.dataset.speaker, alert: !!b.querySelector('.alert'), vis: vis(b) }))
  };
});

(async () => {
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
  await sleep(200);
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const br = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await br.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);
  await sleep(1500);

  // 1. ván mới: slot 0 như SaveDataTemplateProd (dockSlotIndex 0); HUD ở bến theo clip 1050
  let u = await ui(page);
  ok(await ev(page, () => DR.s.dockSlot) === 0, 'new game dockSlot must be 0 (SaveDataTemplateProd.dockSlotIndex)');
  ok(u.hud && u.clock, 'dock view lacks the time dial (#dr-hud .hud-tray)');
  ok(u.bag, 'dock view lacks the TAB chip');
  ok(!u.money, 'dock view still shows money (.dk-money)');
  ok(!u.jb, 'dock view still shows the "Nhiệm vụ" button');
  ok(!u.progress, 'loan bar shown before Mayor_Intro_1_Fish');
  await page.screenshot({ path: path.join(OUT, 'dock-start.png') });

  // 2. luồng thật: có cá trong khoang, ra biển, về bến bằng F, nói chuyện với Mayor -> thanh nợ hiện
  console.log('start chips: ' + JSON.stringify(u.speakers));
  await ev(page, () => { DR.setMode('sail'); });
  await sleep(800);
  await ev(page, () => DR_DEBUG.give('cod'));
  const tele = await ev(page, () => { for (const p of [[9, -9], [10, -8], [8, -10], [7, -8], [9, -6], [10, -4]]) if (DRWorld.sdf(p[0], p[1]) > 1.6) { DR_DEBUG.teleport(p[0], p[1], 2.4); return p; } return null; });
  ok(!!tele, 'no open water SE of the dock');
  await sleep(1200);
  await page.waitForFunction(() => DR.view.nearDock, null, { timeout: 8000 }).catch(() => {});
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 25000 }).catch(() => {});
  const slot = await ev(page, () => DR.s.dockSlot);
  ok(slot === 1 || slot === 2, 'arriving from the SE docks at slot idx 1 or 2 (got ' + slot + ')');
  await dockReady(page);
  await sleep(1500);
  const sp = await ev(page, () => { const v = DRBoat.root.position.clone().project(DRCamera.cam); return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight, z: v.z }; });
  ok(sp.z < 1 && sp.x > 50 && sp.x < 1230 && sp.y > 100 && sp.y < 650, 'boat off-screen in the dock view ' + JSON.stringify(sp));
  await page.screenshot({ path: path.join(OUT, 'dock-arrive.png') });
  u = await ui(page);
  // clip 03:16: cập bến có cá -> Mayor tự mở lời thoại nợ tàu (GreaterMarrow_Root), xong mới hiện thanh nợ
  console.log('arrive chips: ' + JSON.stringify(u.speakers));
  ok(u.progress, 'loan bar missing after the Mayor loan dialogue (gm-debt-introduced)');
  ok(/\$/.test(u.progressTxt || ''), 'loan bar has no remaining amount: ' + u.progressTxt);
  ok(!u.money && u.hud && u.bag, 'HUD state wrong after dialogue');
  await page.screenshot({ path: path.join(OUT, 'dock-loan.png') });

  // chip nhân vật (clip 1050 "Mayor !"): bước PackageDelivery_Offer showAtDock đứng trước, Builder có APlaceToRest_Offer
  await ev(page, () => { DR.s.availableSpeakers.push('Mayor', 'Builder'); DR.s.availableDestinations.push('destination.rest'); DR.setMode('sail'); });
  await sleep(500);
  await ev(page, () => DRDocks.dockAt('dock.greater-marrow', 1, false));
  await dockReady(page);
  await sleep(1500);
  u = await ui(page);
  console.log('chips: ' + JSON.stringify(u.speakers));
  ok(u.speakers.some(c => c.vis && c.n === 'Mayor'), 'Mayor chip not rendered after SetSpeakerAvailability');
  await page.screenshot({ path: path.join(OUT, 'dock-chips.png') });

  // 3. ngày 2: ngủ tại bến rồi chụp
  await page.dispatchEvent('.dk-boat .sub[data-act="rest"]', 'click');
  await page.waitForFunction(() => DRDock._debug().phase === 'ui' && Math.floor(DR.s.time) >= 1, null, { timeout: 40000 }).catch(() => {});
  await sleep(2500);
  const day = await ev(page, () => Math.floor(DR.s.time));
  ok(day >= 1, 'sleeping did not reach day 2 (time ' + day + ')');
  u = await ui(page);
  ok(u.progress, 'loan bar gone on day 2');
  await page.screenshot({ path: path.join(OUT, 'dock-day2.png') });

  ok(errors.length === 0, 'errors: ' + [...new Set(errors)].slice(0, 4).join(' ; '));
  console.log('w2dock: ' + pass + ' pass, ' + fail + ' fail -> ' + OUT);
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
