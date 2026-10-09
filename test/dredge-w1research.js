/*
 * w1research (WORLD-GAPS.md §6 W1): cửa sổ Research của điểm đến nghiên cứu (js/research.js).
 *   - Bố cục đúng cây prefab ResearchWindow (data/research_ui.js): Window 1640x820, 4 tab 150 rộng, 25 mục, số chấm = researchPointsRequired.
 *   - Một "research-item" trong khoang; mở Nghiên cứu ở Greater Marrow; giữ chuột trái 0,5 s trên rod3 (ResearchWindow.researchAction là
 *     DredgePlayerActionHold) → itemIdsResearched có rod3, linh kiện về 0; DRShop.restock(true) → lưới Shipwright có rod3.
 *   - rod11 bị từ chối cho tới khi rod6 đã nghiên cứu; rod6 cần ĐÃ SỞ HỮU rod5 (OwnedItemResearchablePrerequisite).
 *   - SpendResearchItem lấy khoang trước, hết mới lấy Kho; hết linh kiện → không tiến độ, tiếng lỗi, số nháy.
 *   - Màu: viền ô / đường nối POSITIVE khi đủ điều kiện / đã xong, DISABLED nếu không; món chưa mở là bóng trắng.
 * Chạy: node test/dredge-w1research.js    Ảnh: SHOTS (mặc định %TEMP%/dredge-w1research)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w1research');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const ev = (page, f, a) => page.evaluate(f, a);
const POS = '#74d27a', DIS = '#6b6b6b';   // COLOR.POSITIVE / DISABLED (data/research_ui.js colors)

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
const dbg = page => ev(page, () => DRResearch._debug());
const center = r => [r.x + r.w / 2, r.y + r.h / 2];
// giữ chuột trái trên mục (DredgePlayerActionHold 0,5 s) rồi thả
async function hold(page, id, ms) {
  const r = (await dbg(page)).entries[id];
  const [x, y] = center(r);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await sleep(ms == null ? 650 : ms);
  await page.mouse.up();
  await sleep(120);
}
const parts = page => ev(page, () => DRResearch.partCount());

(async () => {
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
  await sleep(200);
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const br = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });

  // 1. dữ liệu: 25 mục, số chấm vẽ sẵn khớp researchPointsRequired, tổng điểm của 25 mục
  const d0 = await ev(page, () => {
    const L = DRResearch.list();
    return { n: L.length, req: L.map(i => DRResearch.required(i)), tot: L.reduce((s, i) => s + DRResearch.required(i), 0), noReq: L.filter(i => !DRResearch.required(i)) };
  });
  ok(d0.n === 25 && !d0.noReq.length, 'expected 25 researchable entries with points: ' + JSON.stringify(d0));
  console.log('entries ' + d0.n + ', sum of points over the 25 scene entries = ' + d0.tot);

  // 2. ván mới → bến Greater Marrow
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => { if (!DR.s.availableDestinations.includes('destination.research')) DR.s.availableDestinations.push('destination.research'); });   // Mayor_Intro_2: AddDestination research
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await dockReady(page);
  await sleep(1200);
  ok(await ev(page, () => DR.s.dock) === 'dock.greater-marrow', 'new game must dock at Greater Marrow');
  ok(await ev(page, () => !(DR.s.itemIdsResearched || []).length && (DR.grid('INVENTORY').items.filter(i => i.id === 'research-item').length === 0)), 'new game starts with nothing researched and no parts');

  // 3. một linh kiện trong khoang; mở Nghiên cứu bằng chuột ở nút thuyền
  await ev(page, () => { DR.give('research-item'); });
  ok(await parts(page) === 1, 'one research-item in inventory');
  await page.hover('#dr-dockui .dk-boat').catch(() => {});
  await page.click('#dr-dockui .dk-boat [data-act="research"]', { timeout: 5000 }).catch(e => console.log('research click: ' + e.message.split('\n')[0]));
  await page.waitForFunction(() => DRResearch.isOpen(), null, { timeout: 8000 }).catch(() => {});
  await sleep(700);
  let s = await dbg(page);
  ok(!!s, 'research window did not open from the dock boat action');
  ok(!(await ev(page, () => !!document.querySelector('#dr-dock .dk-empty'))), 'placeholder "chua co trong ban nay" still shown');
  ok(Math.abs(s.win.w / s.scale - 1640) < 1 && Math.abs(s.win.h / s.scale - 820) < 1, 'window must be 1640x820 canvas units: ' + JSON.stringify(s.win) + ' scale ' + s.scale);
  ok(s.count === 'x1', 'part count text must read x1, got ' + s.count);
  ok(s.tabs.length === 4 && s.tabs.every(t => Math.abs(t.w / s.scale - 150) < 1), 'four tabs 150 wide: ' + JSON.stringify(s.tabs.map(t => t.w / s.scale)));
  ok(s.tabs[0].sel === '1' && s.tabs.slice(1).every(t => t.sel === '0'), 'Rods tab selected first');
  const rodIds = ['rod3', 'rod4', 'rod6', 'rod11', 'rod12', 'rod13', 'rod14', 'rod15'];
  ok(rodIds.every(i => s.entries[i] && s.entries[i].visible), 'rod tab must show 8 entries: ' + Object.keys(s.entries).filter(i => s.entries[i].visible));
  ok(!s.entries.engine3.visible && !s.entries.net2.visible, 'other tabs are hidden');
  // prefab: Researchables ap rod3 (-600,-220) rod4 (-600,0) rod6 (300,170): vị trí tương đối giữa các mục đúng offset của prefab
  const dx = (a, b) => (s.entries[a].x + s.entries[a].w / 2 - s.entries[b].x - s.entries[b].w / 2) / s.scale;
  const dy = (a, b) => (s.entries[a].y + s.entries[a].h / 2 - s.entries[b].y - s.entries[b].h / 2) / s.scale;
  ok(Math.abs(dx('rod6', 'rod4') - 900) < 1 && Math.abs(dy('rod3', 'rod4') - 220) < 1, 'entry offsets must follow the prefab anchoredPositions (rod6-rod4 dx 900, rod3-rod4 dy 220): ' + dx('rod6', 'rod4') + ' ' + dy('rod3', 'rod4'));
  ok(Math.abs(s.entries.rod3.w / s.scale - 150) < 1 && Math.abs(s.entries.rod4.h / s.scale - 225) < 1, 'rod3 150x150, rod4 75x225');
  // trạng thái ban đầu
  const E = s.entries;
  ok(E.rod3.state === 'ready' && E.rod3.can && !E.rod3.silhouette, 'rod3 (no prerequisite) must be ready: ' + JSON.stringify(E.rod3));
  ok(E.rod4.state === 'ready' && E.rod6.state === 'locked' && E.rod6.silhouette, 'rod4 ready, rod6 locked (needs rod5 owned): ' + E.rod4.state + ' ' + E.rod6.state);
  ok(['rod11', 'rod12', 'rod13', 'rod14', 'rod15'].every(i => E[i].state === 'locked' && E[i].silhouette && !E[i].can), 'rod11-rod15 start locked');
  ok(E.rod3.notches === 1 && E.rod4.notches === 2 && E.rod15.notches === 5 && E.rod11.notches === 3, 'notch counts follow researchPointsRequired');
  ok(E.rod3.border === DIS && E.rod12.pre[0] === DIS, 'locked lines / border use DISABLED: ' + E.rod3.border + ' ' + E.rod12.pre[0]);
  await page.screenshot({ path: path.join(OUT, 'rods-1280.png') });

  // 4. hover → tooltip RESEARCH_PREVIEW (tên món) / MYSTERY ("???")
  const rod3name = (await ev(page, () => DR_ITEMS.rod3.name)).toLowerCase();
  let [x, y] = center(E.rod3); await page.mouse.move(x, y); await sleep(500);
  s = await dbg(page);
  ok(!!s.tip && s.tip.toLowerCase().includes(rod3name) && !/\?\?\?/.test(s.tip), 'rod3 tooltip must show the item preview: ' + s.tip);
  ok(/1x/.test(s.tip || ''), 'rod3 tooltip carries the research prompt "Chi [1x cog]": ' + s.tip);
  [x, y] = center(E.rod15); await page.mouse.move(x, y); await sleep(500);
  s = await dbg(page);
  ok(/\?\?\?/.test(s.tip || '') && !/1x/.test(s.tip || ''), 'rod15 (locked) tooltip is mystery "???" with no prompt: ' + s.tip);
  await page.mouse.move(5, 5);

  // 5. nhấn nhanh (không giữ đủ 0,5 s) không tiêu linh kiện
  await hold(page, 'rod3', 150);
  ok(await parts(page) === 1 && !(await ev(page, () => DRResearch.isResearched('rod3'))), 'short press must not research (hold 0.5 s): parts ' + await parts(page));

  // 6. giữ chuột trái 0,5 s trên rod3 → nghiên cứu xong, linh kiện về 0
  const spent0 = await ev(page, () => { window.__rc = 0; DR.on('researchCompleted', id => { window.__rc = id; }); return DR.s.vars['has-spent-research'] === true; });
  ok(!spent0, 'has-spent-research false before any spending');
  await hold(page, 'rod3');
  ok(await ev(page, () => DR.s.itemIdsResearched.includes('rod3')), 'itemIdsResearched must contain rod3 after holding');
  ok(await parts(page) === 0, 'part count must be 0 after spending: ' + await parts(page));
  ok(await ev(page, () => window.__rc === 'rod3' && DR.s.vars['research-progress-rod3'] === 1 && DR.s.vars['has-spent-research'] === true), 'researchCompleted emitted, progress var and has-spent-research set');
  s = await dbg(page);
  ok(s.entries.rod3.state === 'done' && s.entries.rod3.border === POS && s.entries.rod3.sale && s.entries.rod3.post.every(c => c === POS), 'rod3 done: POSITIVE border, post lines, For Sale label: ' + JSON.stringify(s.entries.rod3));
  ok(s.count === 'x0', 'count text x0, got ' + s.count);
  ok(s.entries.rod15.pre.every(c => c === DIS), 'rod15 prerequisite line still DISABLED (rod14 not researched)');
  await page.screenshot({ path: path.join(OUT, 'rods-rod3-done-1280.png') });

  // 7. cửa hàng Shipwright bán rod3 sau khi nhập lại hàng
  const shop = await ev(page, () => {
    DRShop.restock(true);
    const found = [];
    for (const k of Object.keys(DR.s.grids)) { if (k === 'INVENTORY' || k === 'STORAGE') continue; const g = DR.grid(k); if (g.items.some(i => i.id === 'rod3')) found.push(k + ':' + g.items.map(i => i.id).join(',')); }
    return found;
  });
  ok(shop.some(x => x.startsWith('Shop_SHIPWRIGHT_RODS:')), 'Shipwright rods grid must hold rod3 after restock: ' + JSON.stringify(shop));
  console.log('shop grids with rod3 -> ' + shop.join(' | '));

  // 8. hết linh kiện: giữ rod4 → không tiến độ, số nháy đỏ
  await hold(page, 'rod4');
  ok(await ev(page, () => (DR.s.vars['research-progress-rod4'] | 0) === 0 && !DR.s.itemIdsResearched.includes('rod4')), 'no parts: rod4 must not progress');
  ok(await ev(page, () => document.getElementById('dr-rsch').classList.contains('fail')), 'no parts: the count flashes (FlashResearchItemCount)');

  // 9. rod11 bị từ chối tới khi rod6 đã nghiên cứu (rod6 cần SỞ HỮU rod5)
  const g4 = await ev(page, () => [1, 2, 3, 4].map(() => !!DR.give('research-item')));   // 4: rod11 cần 3, rod6 cần 1
  ok(g4.every(Boolean), 'inventory has room for 4 parts: ' + g4);
  await hold(page, 'rod11');
  ok(await parts(page) === 4 && !(await ev(page, () => DR.s.vars['research-progress-rod11'])), 'rod11 locked: holding must not spend (needs rod6 researched)');
  await hold(page, 'rod6');
  ok(await parts(page) === 4 && !(await ev(page, () => DR.s.vars['research-progress-rod6'])), 'rod6 locked: needs rod5 owned (OwnedItemResearchablePrerequisite)');
  console.log('give rod5 ->', await ev(page, () => { const i = DR.give('rod5', null, 'STORAGE'); return !!i && (DR.s.itemsOwned || []).includes('rod5'); }));
  s = await dbg(page);
  ok(s.entries.rod6.state === 'ready' && !s.entries.rod6.silhouette && s.entries.rod11.state === 'locked', 'owning rod5 opens rod6 (and not rod11): ' + s.entries.rod6.state + ' ' + s.entries.rod11.state);
  await hold(page, 'rod6');
  ok(await ev(page, () => DRResearch.isResearched('rod6')) && await parts(page) === 3, 'rod6 researched with 1 part (4 -> 3)');
  s = await dbg(page);
  ok(s.entries.rod11.state === 'ready' && s.entries.rod11.pre.every(c => c === POS), 'rod11 ready once rod6 researched, prerequisite line POSITIVE: ' + JSON.stringify(s.entries.rod11.pre));
  // nhiều chấm: 3 lần giữ, chấm đầy dần, xong ở lần thứ 3
  await hold(page, 'rod11');
  s = await dbg(page);
  ok(s.entries.rod11.progress === 1 && s.entries.rod11.filled === 1 && !(await ev(page, () => DRResearch.isResearched('rod11'))), 'rod11 one hold = one notch filled: ' + JSON.stringify([s.entries.rod11.progress, s.entries.rod11.filled]));
  await hold(page, 'rod11'); await hold(page, 'rod11');
  ok(await ev(page, () => DRResearch.isResearched('rod11')) && await parts(page) === 0, 'rod11 researched after 3 parts; parts 0');
  s = await dbg(page);
  ok(s.entries.rod11.state === 'done' && s.entries.rod11.sale && s.entries.rod15.pre.every(c => c === DIS), 'rod11 done; rod15 line still DISABLED');
  // số chấm đã tiêu: rod3 1 + rod6 1 + rod11 3 = 5 linh kiện
  ok(await ev(page, () => ['rod3', 'rod6', 'rod11'].map(i => DR.s.vars['research-progress-' + i]).join()) === '1,1,3', 'progress variables 1,1,3');

  // 10. Kho: hết trong khoang thì lấy từ Kho (TotalPartCount = khoang + kho)
  await ev(page, () => {
    if (!DR.s.grids.STORAGE) throw new Error('no STORAGE grid at the dock');
    DR.give('research-item', null, 'STORAGE'); DR.give('research-item', null, 'STORAGE'); DR.give('research-item');
  });
  ok(await parts(page) === 3 && (await dbg(page)).count === 'x3', 'count = inventory 1 + storage 2 = 3 (text x3)');
  await hold(page, 'rod4');            // 2 chấm: lần 1 lấy khoang
  const inv1 = await ev(page, () => ({ inv: DR.grid('INVENTORY').items.filter(i => i.id === 'research-item').length, sto: DR.grid('STORAGE').items.filter(i => i.id === 'research-item').length }));
  ok(inv1.inv === 0 && inv1.sto === 2, 'first spend takes from the inventory: ' + JSON.stringify(inv1));
  await hold(page, 'rod4');
  const inv2 = await ev(page, () => ({ inv: DR.grid('INVENTORY').items.filter(i => i.id === 'research-item').length, sto: DR.grid('STORAGE').items.filter(i => i.id === 'research-item').length, done: DRResearch.isResearched('rod4') }));
  ok(inv2.inv === 0 && inv2.sto === 1 && inv2.done, 'then the Storage grid supplies the part; rod4 (2 points) done: ' + JSON.stringify(inv2));

  // 11. tab bằng chuột, phím E / Q; đường nối của tab Động cơ / Bẫy / Lưới
  await page.click('.rs-tab[data-n="EngineTab"]');
  await sleep(250);
  s = await dbg(page);
  ok(s.tab === 1 && s.entries.engine3.visible && !s.entries.rod3.visible && s.tabs[1].sel === '1', 'clicking Engines shows engine entries');
  ok(s.entries.engine3.state === 'ready' && s.entries.engine4.state === 'locked' && s.entries.engine8.state === 'locked', 'engine3 ready, engine4/engine8 locked');
  await page.screenshot({ path: path.join(OUT, 'engines-1280.png') });
  await page.keyboard.press('KeyE'); await sleep(250);
  s = await dbg(page);
  ok(s.tab === 2 && s.entries.pot2.visible && s.entries.pot7.visible, 'E key goes to Pots');
  ok(s.entries.pot5.state === 'locked' && s.entries.pot7.notches === 3, 'pot5 locked (needs pot2 + pot3), pot7 3 notches');
  await page.screenshot({ path: path.join(OUT, 'pots-1280.png') });
  await page.keyboard.press('KeyE'); await sleep(250);
  s = await dbg(page);
  ok(s.tab === 3 && s.entries.net2.visible && s.entries.net6.notches === 4, 'E key goes to Nets');
  await page.screenshot({ path: path.join(OUT, 'nets-1280.png') });
  await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyQ'); await sleep(250);
  ok((await dbg(page)).tab === 0, 'Q key cycles back to Rods');

  // 12. tiền đề đủ cả hai kiểu: pot5 cần pot2 và pot3 (cả hai); đủ một chưa mở
  await ev(page, () => { for (let i = 0; i < 5; i++) DR.give('research-item'); });
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE'); await sleep(250);
  await hold(page, 'pot2');
  s = await dbg(page);
  ok(s.entries.pot2.state === 'done' && s.entries.pot5.state === 'locked' && s.entries.pot5.pre.every(c => c === DIS), 'pot5 needs BOTH pot2 and pot3: still locked with only pot2');
  await hold(page, 'pot3');
  s = await dbg(page);
  ok(s.entries.pot5.state === 'ready' && s.entries.pot5.pre.every(c => c === POS), 'pot5 ready after pot2 + pot3');

  // 13. đóng: Esc → rời điểm đến (về thị trấn); lưu sổ giữ nghiên cứu
  await page.keyboard.press('Escape');
  await sleep(700);
  ok(!(await ev(page, () => DRResearch.isOpen())) && await ev(page, () => DRDock._debug().phase) !== 'dest', 'Esc closes the window and leaves the destination');
  const saved = await ev(page, () => { DR.save(); const j = JSON.parse(localStorage.getItem(DR.saveKey(DR.slot))); return j.itemIdsResearched; });
  ok(saved && saved.includes('rod3') && saved.includes('rod11') && saved.includes('pot2'), 'itemIdsResearched persisted in the save: ' + JSON.stringify(saved));

  // 14. điện thoại ngang 844x390: mở lại, ảnh từng tab
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(600);
  await ev(page, () => DR.give('research-item'));
  await page.hover('#dr-dockui .dk-boat').catch(() => {});
  await page.click('#dr-dockui .dk-boat [data-act="research"]', { timeout: 5000 }).catch(e => console.log('research click (844): ' + e.message.split('\n')[0]));
  await page.waitForFunction(() => DRResearch.isOpen(), null, { timeout: 8000 }).catch(() => {});
  await sleep(700);
  s = await dbg(page);
  ok(!!s && s.win.w <= 844 && s.win.h <= 390 && s.win.x >= 0 && s.win.y >= 0, 'window fits 844x390: ' + JSON.stringify(s && s.win));
  await page.screenshot({ path: path.join(OUT, 'rods-844.png') });
  await page.keyboard.press('KeyE'); await sleep(250);
  await page.screenshot({ path: path.join(OUT, 'engines-844.png') });
  await page.keyboard.press('Escape'); await sleep(500);

  ok(!errors.length, 'console / page errors: ' + errors.slice(0, 4).join(' | '));
  console.log('pass ' + pass + ' fail ' + fail + '   screenshots: ' + OUT);
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
