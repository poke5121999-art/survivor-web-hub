/*
 * DREDGE — Biển Mù: kiểm điểm kiểm tra trên biển (js/poi.js, V17) bằng phím và chuột thật: phao Buoy_Inspect ("Inspect F" + dấu "?")
 * và xác tàu GM_ShoreCache1 (lưới Found Items qua DRCargo, đồ lấy rồi không sinh lại).
 * Giá trị đối chiếu từ bản gốc: Game.unity InspectPOIs (vị trí, bán kính 5, node), QuestGridConfig GMShoreCache1 (5 món, 3x3), Dredge.asset (lời Yarn),
 * và video ObBBFGMem5U t=166 (phao), t=2360 (Found Items, "You can return to these items later.").
 *
 * Chạy: node test/dredge-w2poi.js        Ra: %TEMP%/dredge-w2poi/*.png (1920x1080 và 844x390)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w2poi');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' (' + (typeof a === 'number' ? a.toFixed(2) : a) + ' ~ ' + (typeof b === 'number' ? b.toFixed(2) : b) + ' +-' + tol + ')');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const ROOT = path.resolve(__dirname, '..');
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
async function load(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
}
async function newGame(page) {
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
}
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
async function toSea(page) {
  await dockReady(page);
  await ev(page, () => DR.setMode('sail'));
  await sleep(500);
  await ev(page, () => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 4; r < 9; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 2.5) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await ev(page, () => DR_DEBUG.setTime(0.5));
  await sleep(800);
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  return errors;
}

// ------------------------------------------------------------------------------------------------ giá trị gốc
// InspectPOIs/Buoy_Inspect (Game.unity): (41,63 ; 7,73) three.js, cầu r = 5, isOneTimeOnly = 1, node Buoy_Inspect (2 dòng)
// InspectPOIs/GM_ShoreCache1: (-17 ; -36), r = 5, node GM_ShoreCache1 -> ShowQuestGrid GMShoreCache1 (5 món), hideAfter GM_ShoreCache1_Emptied
const BUOY = { x: 41.63, z: 7.73, r: 5 }, WRECK = { x: -17, z: -36 };
const BUOY_LINES = ['A floating buoy.', 'Its dim light also provides a brief respite'];

async function tp(page, x, z) {
  await ev(page, ([x, z]) => DR_DEBUG.teleport(x, z, 0), [x, z]);
  await sleep(500);
}
async function dbg(page) { return ev(page, () => DRPoi._debug()); }
async function pump(page, stop, limit) {            // đi hội thoại bằng Space tới khi stop() đúng
  for (let i = 0; i < (limit || 40); i++) {
    if (await ev(page, stop)) return true;
    const st = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (st && st.kind === 'options') { await sleep(700); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(450);
  }
  return ev(page, stop);
}

async function poiTests(page, vw, vh, tag) {
  console.log('Điểm kiểm tra ' + tag);
  const P = await ev(page, () => DR_POI.points.map(p => ({ id: p.id, x: p.x, z: p.z, r: p.r, node: p.node })));
  ok(P.length === 50, 'data/poi.js có 50 điểm (38 InspectPOI con trực tiếp trong markers.json + 12 ConversationPOI đọc từ Game.unity, W3); có ' + P.length);
  const b = P.find(p => p.id === 'Buoy_Inspect');
  near(b.x, BUOY.x, 0.01, 'phao x'); near(b.z, BUOY.z, 0.01, 'phao z'); ok(b.r === BUOY.r, 'phao bán kính 5');
  ok(P.filter(p => /^GM_/.test(p.id)).length === 3 && P.some(p => p.id === 'Lighthouse_Inspect'), 'có 3 kho bờ biển GM và Lighthouse_Inspect');

  // ---- xa phao: không dấu "?", không gợi ý
  await tp(page, BUOY.x - 14, BUOY.z);
  let d = await dbg(page);
  ok(d.near === null && !d.prompt && d.marker.opacity === 0, 'cách phao 14 m: không điểm gần, không gợi ý, không dấu "?"');
  // ---- trong tầm
  await tp(page, BUOY.x - 4, BUOY.z);
  await page.waitForFunction(() => DRPoi._debug().near === 'Buoy_Inspect', null, { timeout: 4000 }).catch(() => {});
  await sleep(1200);                                  // fade 0,75 s
  d = await dbg(page);
  ok(d.near === 'Buoy_Inspect', 'cách phao 4 m: điểm gần = Buoy_Inspect (' + d.near + ')');
  ok(d.prompt, 'gợi ý "Kiểm tra F" hiện');
  ok(await ev(page, () => /Kiểm tra/.test(document.querySelector('.poi-prompt').textContent) && document.querySelector('.poi-prompt kbd').textContent === 'F'), 'gợi ý đọc "Kiểm tra" + phím F');
  ok(d.marker.opacity > 0.95 && d.marker.w >= 26, 'dấu "?" đã hiện đủ (opacity ' + d.marker.opacity + ', ' + d.marker.w + ' px)');
  const pos = await ev(page, () => { const r = document.querySelector('.poi-mk').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: innerWidth, h: innerHeight }; });
  ok(pos.x > 0 && pos.x < pos.w && pos.y > 0 && pos.y < pos.h, 'dấu "?" nằm trong màn hình (' + Math.round(pos.x) + ',' + Math.round(pos.y) + ')');
  await page.screenshot({ path: path.join(OUT, 'inspect-buoy-prompt-' + tag + '.png') });

  // ---- F mở hội thoại, khoá lái
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
  await sleep(1500);
  const st = await ev(page, () => DRDialogue.state());
  ok(st && st.node === 'Buoy_Inspect', 'F chạy node Yarn Buoy_Inspect');
  ok(st && st.text.indexOf(BUOY_LINES[0]) === 0, 'dòng đầu: "' + (st && st.text.slice(0, 40)) + '"');
  d = await dbg(page);
  ok(d.active === 'Buoy_Inspect' && !d.prompt, 'trong hội thoại: đang kiểm tra, gợi ý ẩn');
  const p0 = await ev(page, () => ({ x: DR.s.boat.x, z: DR.s.boat.z, sp: DRBoat.speed() }));
  await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
  const p1 = await ev(page, () => ({ x: DR.s.boat.x, z: DR.s.boat.z, sp: DRBoat.speed() }));
  ok(p1.sp <= p0.sp + 0.05 && Math.hypot(p1.x - p0.x, p1.z - p0.z) < 1, 'giữ W trong hội thoại: thuyền không tăng tốc (' + p0.sp.toFixed(2) + ' -> ' + p1.sp.toFixed(2) + ')');
  ok(await ev(page, () => DR.mode === 'sail'), 'vẫn ở chế độ biển, không cập bến nhầm khi bấm F/Space');
  await page.screenshot({ path: path.join(OUT, 'inspect-buoy-' + tag + '.png') });
  const second = await pump(page, () => { const s = DRDialogue.isOpen() && DRDialogue.state(); return s && /brief respite/.test(s.text || ''); }, 12);
  ok(second, 'dòng thứ hai nhắc "brief respite"');
  await page.screenshot({ path: path.join(OUT, 'inspect-buoy-2-' + tag + '.png') });
  ok(await pump(page, () => !DRDialogue.isOpen(), 12), 'hội thoại kết thúc');
  await sleep(600);
  ok(await ev(page, () => DRYarn.visited('Buoy_Inspect')), 'node Buoy_Inspect đã thăm');
  d = await dbg(page);
  ok(d.near === null && !d.prompt && !d.enabledNow.includes('Buoy_Inspect'), 'isOneTimeOnly: phao hết hiện sau khi xem (gợi ý tắt, điểm bị vô hiệu)');
  await sleep(900);
  ok((await dbg(page)).marker.opacity === 0, 'dấu "?" đã tắt hẳn');

  // ---- không rò F khi gần bến / điểm câu: gần bến thì điểm kiểm tra nhường
  const dk = await ev(page, () => { const d = DRDocks.byId['dock.greater-marrow']; return { x: d.poi.x, z: d.poi.z }; });
  await tp(page, dk.x + 6, dk.z + 1);
  await sleep(600);
  d = await dbg(page);
  ok(d.near === null && !d.prompt, 'gần bến Greater Marrow: điểm kiểm tra nhường bến (near ' + d.near + ')');

  // ---- xác tàu: Found Items
  await tp(page, WRECK.x - 3, WRECK.z);
  await page.waitForFunction(() => DRPoi._debug().near === 'GM_ShoreCache1', null, { timeout: 5000 }).catch(() => {});
  d = await dbg(page);
  ok(d.near === 'GM_ShoreCache1', 'gần xác tàu GM_ShoreCache1: điểm gần đúng (' + d.near + ')');
  await sleep(900);
  await page.keyboard.press('KeyF');
  const sawGrid = await pump(page, () => DRCargo.isOpen(), 30);
  ok(sawGrid, 'sau "Look inside" lưới Found Items mở bằng DRCargo');
  await sleep(1400);
  let c = await ev(page, () => DRCargo._debug());
  ok(c && c.leftKind === 'quest', 'bảng trái là lưới nhiệm vụ (kind ' + (c && c.leftKind) + ')');
  const left = c.grids.find(g => g.key !== 'INVENTORY');
  ok(left && left.key === 'GM_SHORE_CACHE_1', 'khoá lưới GM_SHORE_CACHE_1 (' + (left && left.key) + ')');
  ok(left && left.cols === 3 && left.rows === 3, 'lưới 3x3 (ItemPickup3x3)');
  const ids = left.items.map(i => i.id).sort().join();
  ok(ids === 'iron-chain,lumber,lumber,research-item,ring-2', 'đúng 5 món gốc: ' + ids);
  ok(await ev(page, () => /Đồ tìm thấy/.test(document.body.innerText) && /quay lại lấy những món này sau/.test(document.body.innerText)), 'tiêu đề "Đồ tìm thấy" và dòng "có thể quay lại lấy sau"');
  ok(await ev(page, () => !!document.querySelector('.cg-done[data-act="done"]')), 'nút Xong hiện');
  await page.screenshot({ path: path.join(OUT, 'wreck-items-' + tag + '.png') });

  // lấy một món bằng chuột thật: bấm món (iron-chain), bấm ô trống trong khoang
  const sc = c.cs;
  const it = left.items.find(i => i.id === 'iron-chain');
  await page.mouse.move(left.x + (it.x + 0.5) * sc, left.y + (it.y + 0.5) * sc); await sleep(200);
  await page.mouse.down(); await page.mouse.up(); await sleep(300);
  c = await ev(page, () => DRCargo._debug());
  ok(c.held && c.held.id === 'iron-chain', 'bấm món: iron-chain dính con trỏ (' + (c.held && c.held.id) + ')');
  const inv = c.grids.find(g => g.key === 'INVENTORY');
  let placed = false;
  for (let gy = 0; gy < inv.rows && !placed; gy++) for (let gx = 0; gx < inv.cols && !placed; gx++) {
    await page.mouse.move(inv.x + (gx + 0.5) * sc, inv.y + (gy + 0.5) * sc); await sleep(60);
    const cand = await ev(page, () => { const q = DRCargo._debug(); return q.cand && q.cand.state; });
    if (cand === 'ok') { await page.mouse.down(); await page.mouse.up(); await sleep(250); placed = !(await ev(page, () => DRCargo._debug().held)); }
  }
  ok(placed, 'đặt iron-chain vào khoang');
  c = await ev(page, () => DRCargo._debug());
  const left2 = c.grids.find(g => g.key === 'GM_SHORE_CACHE_1');
  ok(left2.items.length === 4 && !left2.items.some(i => i.id === 'iron-chain'), 'lưới Found Items còn 4 món, iron-chain đã đi (' + left2.items.map(i => i.id).join() + ')');
  ok(await ev(page, () => DR.grid('INVENTORY').items.some(i => i.id === 'iron-chain')), 'iron-chain nằm trong khoang thuyền');
  await page.screenshot({ path: path.join(OUT, 'wreck-items-taken-' + tag + '.png') });
  // Xong
  await page.click('.cg-done[data-act="done"]');
  await sleep(700);
  ok(await pump(page, () => !DRDialogue.isOpen() && !DRCargo.isOpen(), 12), 'bấm Xong: đóng lưới, hội thoại kết thúc');
  ok(await ev(page, () => !DRYarn.visited('GM_ShoreCache1_Emptied')), 'chưa lấy hết thì chưa chạy node GM_ShoreCache1_Emptied');
  await sleep(500);
  ok((await dbg(page)).enabledNow.includes('GM_ShoreCache1'), 'xác tàu vẫn còn dấu "?" (REVISITABLE)');
  // quay lại: món đã lấy không còn
  await page.keyboard.press('KeyF');
  ok(await pump(page, () => DRCargo.isOpen(), 30), 'quay lại xác tàu: lưới mở lại');
  await sleep(1200);
  c = await ev(page, () => DRCargo._debug());
  const back = c.grids.find(g => g.key === 'GM_SHORE_CACHE_1');
  ok(back.items.length === 4 && !back.items.some(i => i.id === 'iron-chain'), 'quay lại: vẫn 4 món, iron-chain không sinh lại');
  // lấy hết (đặt trực tiếp vào sổ lưu), bấm Xong: kết quả COMPLETE -> node _Emptied
  await ev(page, () => { const g = DR.grid('GM_SHORE_CACHE_1'); for (const i of g.items.slice()) DRGrid.remove(g, i); DRCargo.refresh(); });
  await sleep(300);
  await page.click('.cg-done[data-act="done"]');
  ok(await pump(page, () => !DRDialogue.isOpen() && !DRCargo.isOpen(), 12), 'lưới trống, bấm Xong: kết thúc');
  await sleep(400);
  ok(await ev(page, () => DRYarn.visited('GM_ShoreCache1_Emptied')), 'lưới trống: chạy node GM_ShoreCache1_Emptied');
  ok(!(await dbg(page)).enabledNow.includes('GM_ShoreCache1'), 'xác tàu hết hiện sau khi lấy sạch (shouldDisableOnOtherNodeVisit)');
}

(async () => {
  const srv = await serve(), base = process.env.DR_URL || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  let errors = [];
  const sizes = process.env.PHONE_ONLY ? [[844, 390, 'phone']] : [[1920, 1080, '1080'], [844, 390, 'phone']];
  for (const [vw, vh, tag] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await ctx.newPage();
    errors = errors.concat(watch(page));
    await load(page, base);
    await newGame(page);
    await toSea(page);
    await ev(page, () => DR_DEBUG.setTime(0.5));
    try { await poiTests(page, vw, vh, tag); } catch (e) { fail++; console.log('  FAIL ngoại lệ: ' + e.message.split('\n')[0]); }
    await ctx.close();
  }
  const uniq = [...new Set(errors)];
  ok(uniq.length === 0, 'không có pageerror / console.error / HTTP >= 400' + (uniq.length ? ': ' + uniq.slice(0, 5).join(' ; ') : ''));
  console.log('\n' + pass + ' pass, ' + fail + ' fail -> ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
