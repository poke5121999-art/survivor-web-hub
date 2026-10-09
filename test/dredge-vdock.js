/*
 * DREDGE Biển Mù, vòng 4, owner vdock: V05 (nhân vật + lời chào ở cửa hàng, Return to Town, Q/E), V06 (màn bến), V07 (ngủ / lắp đồ: màn thời gian trôi).
 * Chạy: node test/dredge-vdock.js   Ảnh: %TEMP%/dredge-vdock/
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process['env'].PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(os.tmpdir(), 'dredge-vdock'); fs.mkdirSync(OUT, { recursive: true });
const SW = 'destination.gm-shipwright', FM = 'destination.gm-fishmonger';
let pass = 0, fail = 0;
const check = (name, ok, info) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary' };
const ROOT = path.resolve(__dirname, '..');
const serve = () => new Promise(res => { const s = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0, () => res(s)); });

async function fresh(browser, base, setup, vp) {
  const page = await (await browser.newContext({ viewport: vp || { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 150)); });
  page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock');
  await page.evaluate(([s]) => { DR.s.funds = 150; DR.s.availableDestinations.push(...s); window.DRIntro && DRIntro.playing && DRIntro.skip(); }, [setup || []]);
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);
  return { page, errs };
}
async function dockReady(page) {
  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => { const d = DRDock._debug(), open = DRDialogue.isOpen(); return { ready: !!d && d.phase === 'ui' && !open, st: open ? DRDialogue.state() : null }; });
    if (s.ready) return;
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {}); else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
  throw new Error('dock UI never ready');
}
async function openShop(page, id) {
  await page.dispatchEvent('.dk-dest[data-dest="' + id + '"]', 'click');
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => DRShop.isOpen() && DRCargo.isOpen())) break;
    const st = await page.evaluate(() => { const s = DRDialogue.isOpen() && DRDialogue.state(); return s ? s.kind : null; });
    if (st === 'options') { await sleep(700); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); } else if (st) await page.keyboard.press('Space');
    await sleep(350);
  }
  await sleep(1200);
}

(async () => {
  const srv = await serve(), base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const allErrs = [];

  // ---- V05: thợ đóng tàu, người buôn cá
  for (const [id, who, tab] of [[SW, 'Shipwright', true], [FM, 'Fishmonger', false]]) {
    const { page, errs } = await fresh(browser, base, [SW, FM]);
    await openShop(page, id);
    const g = await page.evaluate(() => DRDock._debug().greet);
    check(who + ': chân dung đứng giữa màn (prefab ' + who + ')', !!g && g.prefab.includes(who), g && g.prefab);
    check(who + ': hộp lời chào có chữ', !!g && !!g.text && g.text.length > 8, g && g.text && g.text.slice(0, 60));
    if (id === SW) check('Shipwright: lời chào gốc "Take a look \'round..."', !!g && /Take a look 'round\. Just remember - the bigger the equipment, the longer it takes to install\. So plan ahead\./.test(g.text || ''), g && g.text);
    const box = await page.evaluate(() => { const p = document.querySelector('#dr-greet .dlg-pf'); const r = p && p.getBoundingClientRect(); return r && { cx: (r.left + r.right) / 2 / innerWidth, w: r.width }; });
    check(who + ': nhân vật ở giữa chiều ngang (0.35..0.65)', !!box && box.cx > 0.35 && box.cx < 0.65, box);
    const prompts = await page.evaluate(() => DRCargo._debug().prompts.filter(p => p.area === 'control').map(p => p.id + ':' + p.bind));
    check(who + ': có "Return to Town [Esc]" ở vùng điều khiển', prompts.some(p => p === 'return:Escape'), prompts);
    if (tab) {
      const qe = await page.evaluate(() => { const t = document.querySelector('.cg-left.cg-shop .cg-ltabs'); return t && [getComputedStyle(t, '::before').content, getComputedStyle(t.querySelector('.cg-tab:last-of-type'), '::after').content]; });
      check('Shipwright: glyph Q và E hai đầu thanh tab', !!qe && qe[0] === '"Q"' && qe[1] === '"E"', qe);
      const mode = await page.evaluate(() => { const b = document.querySelector('.cg-cbtn[data-act="repair-mode"]'); return b && getComputedStyle(b, '::after').content; });
      check('Shipwright: nút "Vào chế độ sửa" có glyph T', mode === '"T"', mode);
    }
    await page.screenshot({ path: path.join(OUT, id === SW ? 'shipwright.png' : 'fishmonger.png') });
    await page.keyboard.press('Escape'); await sleep(700);
    const after = await page.evaluate(() => ({ greet: !!document.getElementById('dr-greet'), shop: DRShop.isOpen(), phase: DRDock._debug() && DRDock._debug().phase }));
    check(who + ': Esc rời cửa hàng, nhân vật biến mất', !after.greet && !after.shop, after);
    allErrs.push(...errs); await page.context().close();
  }

  // ---- V05: hộp lời chào hiện đủ, không bị bảng cửa hàng che (1280x720 và 844x390)
  for (const vp of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    const { page, errs } = await fresh(browser, base, [SW, FM], vp);
    await openShop(page, SW);
    await page.addStyleTag({ content: '#dr-greet *, #dr-passtime * { pointer-events: auto !important; }' });   // elementFromPoint bỏ qua phần tử pointer-events:none
    const r = await page.evaluate(() => {
      const box = document.querySelector('#dr-greet .dlg-box'), tx = box.querySelector('.dlg-text');
      const rg = document.createRange(); rg.setStart(tx.firstChild, 0); rg.setEnd(tx.firstChild, 0);
      const first = tx.querySelector('.g, span') || tx; const fr = first.getBoundingClientRect();
      const b = box.getBoundingClientRect(), pts = [[fr.left + 2, fr.top + fr.height / 2], [b.left + 4, b.top + b.height / 2], [b.right - 4, b.top + b.height / 2]];
      return { box: [b.left, b.right, innerWidth], hit: pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#dr-greet')); }), text: tx.textContent.slice(0, 12) };
    });
    check('Hộp lời chào ' + vp.width + 'x' + vp.height + ': điểm chữ đầu và hai mép hộp không bị bảng che, chữ bắt đầu "Take a look"', r.hit.every(Boolean) && r.text.startsWith('Take a look') && r.box[0] >= 0 && r.box[1] <= r.box[2], r);
    await page.screenshot({ path: path.join(OUT, 'greet-' + vp.width + '.png') });
    allErrs.push(...errs); await page.context().close();
  }

  // ---- V06: màn bến
  {
    const { page, errs } = await fresh(browser, base, [SW, FM, 'destination.rest', 'destination.research']);
    await page.evaluate(() => { DR.s.vars['gm-debt-introduced'] = true; DR.s.vars['gm-repayments'] = 4.5; DRYarn.ensure().availableSpeakers.push('Mayor'); });
    await page.evaluate(() => DR.emit('mode', 'dock'));   // dựng lại giao diện bến với biến mới
    await sleep(1800);
    const s = await page.evaluate(() => {
      const q = sel => document.querySelector(sel);
      return { subs: [...document.querySelectorAll('.dk-boat .sub')].map(b => b.dataset.act), leave: q('.dk-leave') && q('.dk-leave').textContent, debt: q('.dk-progress') && q('.dk-progress').textContent,
        debtLeft: q('.dk-progress') && q('.dk-progress').dataset.debtLeft, speakers: DRDock._debug().speakers, alert: !!q('.dk-speaker .alert') };
    });
    check('Bến: ba nút tròn cạnh thuyền (Rời bến, Ngủ, Nghiên cứu)', JSON.stringify(s.subs) === '["undock","rest","research"]', s.subs);
    check('Bến: nút "Rời đi [Space]" góc dưới phải', /Rời đi/.test(s.leave || '') && /Space/.test(s.leave || ''), s.leave);
    const cfgDebt = await page.evaluate(() => DR_CONFIG.greaterMarrowDebt);
    check('Bến: thanh nợ "Ship Loan Repayments" dưới tên bến, còn lại = nợ - đã trả', !!s.debt && +s.debtLeft === cfgDebt - 4.5, { debt: s.debt, left: s.debtLeft, cfgDebt });
    check('Bến: chip nhân vật Mayor', s.speakers.includes('Mayor'), { speakers: s.speakers, alert: s.alert });
    const rect = await page.evaluate(() => { const r = document.querySelector('.dk-leave').getBoundingClientRect(); return [r.right / innerWidth, r.bottom / innerHeight]; });
    check('Bến: nút Rời đi sát mép phải-dưới', rect[0] > 0.9 && rect[1] > 0.9, rect);
    await page.screenshot({ path: path.join(OUT, 'dock.png') });
    // thuyền hiện ở cầu tàu khi đỗ ở slot 2 (slot 0 bị sàn cầu che từ camera bến)
    const vis = await page.evaluate(() => { DRBoat.place(5.5, -3.5, Math.PI); const v = new THREE.Vector3(5.5, 0, -3.5).project(DRCamera.cam); return { x: v.x * .5 + .5, y: -v.y * .5 + .5, vis: DRBoat.root.visible }; });
    check('Bến: thuyền đỗ slot 2 nằm trong khung hình dock camera', vis.vis && vis.x > 0 && vis.x < 1 && vis.y > 0 && vis.y < 1, vis);
    await page.keyboard.press('Space'); await sleep(600);
    check('Bến: Space rời bến sang chế độ lái', (await page.evaluate(() => DR.mode)) === 'sail');
    allErrs.push(...errs); await page.context().close();
  }

  // ---- V07: ngủ
  {
    const { page, errs } = await fresh(browser, base, ['destination.rest']);
    await page.evaluate(() => { DR_DEBUG.setTime(0.9); });
    await sleep(500);
    await page.click('.dk-boat .sub[data-act="rest"]');
    await sleep(2500);
    const mid = await page.evaluate(() => DRPassTime._debug());
    check('Ngủ: màn "Đang nghỉ tới bình minh..." hiện', mid.shown && /nghỉ tới bình minh/.test(mid.text), mid);
    const deg = parseFloat(mid.deg);
    check('Ngủ: vòng tiến trình đã đầy một phần (0 < độ < 360)', deg > 0 && deg < 360, deg);
    await page.addStyleTag({ content: '#dr-passtime * { pointer-events: auto !important; }' });
    const hg = await page.evaluate(() => { const i = document.querySelector('#dr-passtime .pt-glass'), r = i.getBoundingClientRect(), ring = document.querySelector('#dr-passtime .pt-ring').getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { nw: i.naturalWidth, w: r.width, h: r.height, inScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, cx: (r.left + r.right) / 2 - (ring.left + ring.right) / 2, inRing: r.width < ring.width && r.height < ring.height, top: !!e && !!e.closest('#dr-passtime') }; });
    check('Ngủ: đồng hồ cát hiện (naturalWidth > 0, trong màn, nằm giữa vòng)', hg.nw > 0 && hg.w > 20 && hg.inScreen && Math.abs(hg.cx) < 2 && hg.inRing && hg.top, hg);
    await page.screenshot({ path: path.join(OUT, 'rest.png') });
    const t1 = Date.now();
    await page.waitForFunction(() => !DRPassTime.isShown(), null, { timeout: 40000 });
    const real = (Date.now() - t1 + 2500) / 1000;
    const tEnd = await page.evaluate(() => DR.s.time % 1);
    check('Ngủ: đồng hồ dừng ở 06:00 (0.25)', Math.abs(tEnd - 0.25) < 0.01, tEnd);
    check('Ngủ: mất khoảng 6 s thực cho ~9 giờ (clip: 6 s)', real > 3 && real < 12, real.toFixed(1) + ' s');
    await sleep(500);
    await dockReady(page);       // RestDestination xong -> về node gốc của bến (BaseDestinationUI.OnLeavePressComplete -> dockUI.Show)
    check('Ngủ: xong thì quay ra màn bến', await page.evaluate(() => DRDock._debug().phase) === 'ui');
    // Esc giữa chừng
    await page.evaluate(() => DR_DEBUG.setTime(0.9)); await sleep(300);
    await page.click('.dk-boat .sub[data-act="rest"]'); await sleep(1500);
    const tm = await page.evaluate(() => DR.s.time);
    await page.keyboard.press('Escape'); await sleep(900);
    const after = await page.evaluate(() => ({ shown: DRPassTime.isShown(), t: DR.s.time }));
    check('Ngủ: Esc (Thức dậy) dừng giữa chừng, đồng hồ chưa tới 06:00', !after.shown && after.t % 1 < 0.249 && after.t - tm < 0.1, { tm, after });
    allErrs.push(...errs); await page.context().close();
  }

  // ---- V07: lắp đồ (cargo.js phát passTime 'INSTALL')
  {
    const { page, errs } = await fresh(browser, base, []);
    await page.evaluate(() => DR.emit('passTime', 3, 'INSTALL'));
    await sleep(1000);
    const d = await page.evaluate(() => ({ dbg: DRPassTime._debug(), wake: getComputedStyle(document.querySelector('#dr-passtime .pt-wake')).display }));
    check('Lắp đồ: màn "Đang lắp thiết bị..." (không có nút Thức dậy)', d.dbg.shown && /lắp thiết bị/.test(d.dbg.text) && d.wake === 'none', d);
    await page.screenshot({ path: path.join(OUT, 'install.png') });
    await page.waitForFunction(() => !DRPassTime.isShown(), null, { timeout: 30000 });
    check('Lắp đồ: tự đóng khi hết giờ', true);
    allErrs.push(...errs); await page.context().close();
  }

  const e = [...new Set(allErrs)];
  check('không có pageerror / console error / HTTP >= 400', e.length === 0, e.slice(0, 5));
  console.log(pass + ' pass / ' + fail + ' fail  -> ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
