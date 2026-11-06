/*
 * DREDGE — Biển Mù: kiểm Bản đồ (phím M, js/map.js) và Bách khoa (phím L, js/encyclopedia.js) bằng phím và chuột thật.
 * Giá trị đối chiếu lấy từ bản gốc: MapWindow (19 cột A..S x 15 hàng, 0,601 canvas/m), Encyclopedia.cs (trang chẵn/lẻ, lọc loại),
 * EncyclopediaPage.cs (định dạng "n Caught", giá "n2", cỡ cm) và video DREDGE demo (t=360: "#1 ???", "#2 Cod", "3 Caught", "$ 18.00", "78.60 cm").
 *
 * Chạy: node test/dredge-vbook.js        Ra: %TEMP%/dredge-vbook/*.png (1920x1080 và 844x390)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-vbook');
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
const CANVAS_PER_M = 1142 / 2000 / 0.95;           // MapWindow.GetMapPositionFromWorldPosition

// ------------------------------------------------------------------------------------------------ Bản đồ
async function mapTests(page, vw, vh, tag) {
  console.log('Bản đồ ' + tag);
  const s = Math.min(vh / 1080, vw / 1920);
  // vào đúng chỗ Little Marrow (140,94 ; -5,61 trong three.js) quay hướng đông (heading 90 độ)
  await ev(page, () => { DR_DEBUG.teleport(140.94, -5.61, -Math.PI / 2); DR.s.vars['has-visited-dock-dock.greater-marrow'] = true; DR.s.vars['has-visited-dock-dock.little-marrow'] = true; });
  await sleep(500);
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.DRMap && DRMap.isOpen(), null, { timeout: 5000 });
  await sleep(900);
  const d = await ev(page, () => DRMap._debug());
  ok(await ev(page, () => DRBook.isOpen() && DRBook.which() === 'map'), 'DRBook báo bản đồ đang mở');
  ok(await ev(page, () => DR.timeScale < 0.01), 'đồng hồ game dừng khi bản đồ mở (timeScale ~ 0)');
  ok(d.letters.length === 19 && d.letters.map(l => l.t).join('') === 'ABCDEFGHIJKLMNOPQRS', 'cột A..S (19 chữ)');
  const xs = d.letters.sort((a, b) => a.t < b.t ? -1 : 1).map(l => l.x);
  near(xs[1] - xs[0], 59.7 * s, 0.6 * s + 0.3, 'bề rộng một ô = 59,7 đơn vị canvas');
  const rows = d.numbers.filter(n => n.y >= d.mask.y - 40 * s && n.y <= d.mask.y + d.mask.h).map(n => +n.t).filter(v => v >= 1).sort((a, b) => a - b);
  ok(rows.length >= 15 && rows[0] === 1 && rows.indexOf(15) >= 0, 'hàng 1..15 nằm trong khung (' + rows.join(',') + ')');
  near(d.mask.w, 1135 * s, 1, 'MapMask rộng 1135 đơn vị'); near(d.mask.h, 896 * s, 1, 'MapMask cao 896 đơn vị');
  near(d.title.h, 80 * s, 1.5, 'ruy băng tiêu đề cao 80');
  const cx = d.contents.x + d.contents.w / 2, cy = d.contents.y + d.contents.h / 2;
  const yx = d.you.x + d.you.w / 2, yy = d.you.y + d.you.h / 2;
  near((yx - cx) / s, 140.94 * CANVAS_PER_M, 1.5, 'thuyền đặt đúng x = 140,94 m * 0,601');
  near((cy - yy) / s, 5.61 * CANVAS_PER_M, 1.5, 'thuyền đặt đúng y (z Unity = -z three.js) = 5,61 m * 0,601');
  ok(d.boatIdx === 4, 'hướng đông chọn sprite thuyền số 4 (round(90 / 22,5)); idx=' + d.boatIdx);
  ok(d.docks.filter(x => x.shown).map(x => x.id).sort().join() === 'dock.greater-marrow,dock.little-marrow', 'chỉ bến đã cập có nhãn (Greater / Little Marrow); hiện: ' + d.docks.filter(x => x.shown).map(x => x.id).join());
  ok(d.areas.length === 5, '5 nhãn vùng; chữ: ' + d.areas.map(a => a.t).join('|'));
  ok(d.areas.find(a => a.n === 'The Marrows').t.toUpperCase() === 'THE MARROWS', 'vùng đang ở có tên THE MARROWS');
  await page.screenshot({ path: path.join(OUT, 'map-' + tag + '.png') });
  // chặn lái: giữ W một giây, thuyền không nhúc nhích
  const p0 = await ev(page, () => ({ x: DR.s.boat.x, z: DR.s.boat.z }));
  await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW');
  const p1 = await ev(page, () => ({ x: DR.s.boat.x, z: DR.s.boat.z }));
  ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05, 'giữ W khi bản đồ mở thì thuyền đứng yên (' + Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(3) + ' m)');
  await page.keyboard.press('Escape');
  await sleep(500);
  ok(!(await ev(page, () => DRMap.isOpen())), 'Esc đóng bản đồ');
  ok(await ev(page, () => DR.timeScale === 1 && !document.getElementById('dr-pause') || DR.timeScale === 1), 'timeScale về 1 sau khi đóng');
  ok(await ev(page, () => { const p = document.getElementById('dr-pause'); return !p || p.hidden; }), 'Esc không bật màn tạm dừng');
  await page.keyboard.press('KeyM'); await sleep(300);
  ok(await ev(page, () => DRMap.isOpen()), 'M mở lại'); await page.keyboard.press('KeyM'); await sleep(300);
  ok(!(await ev(page, () => DRMap.isOpen())), 'M bấm lần nữa thì đóng');
}

// ------------------------------------------------------------------------------------------------ Bách khoa
async function encTests(page, vw, vh, tag) {
  console.log('Bách khoa ' + tag);
  const s = Math.min(vh / 1080, vw / 1920);
  const info = await ev(page, () => {
    DR.s.caught.cod = 3; DR.s.vars['enc-largest-cod'] = (78.6 - 50) / 70; DR.s.vars['enc-sold-cod'] = 1;
    const fish = DR_BOOK.enc.fish.map(id => DR_ITEMS[id]).filter(f => f && !(f.entitlementsRequired || []).some(e => e === 'DLC_1' || e === 'DLC_2'));
    return { n: fish.length, first: fish.slice(0, 4).map(f => f.id), coastal: fish.filter(f => f.harvestableType === 'COASTAL').length,
      gale: fish.findIndex(f => f.zonesFoundIn.indexOf('GALE_CLIFFS') >= 0), galeId: (fish.find(f => f.zonesFoundIn.indexOf('GALE_CLIFFS') >= 0) || {}).id, codAb: DR_ITEMS.cod.aberrations };
  });
  await page.keyboard.press('KeyL');
  await page.waitForFunction(() => window.DREncyclopedia && DREncyclopedia.isOpen(), null, { timeout: 5000 });
  await sleep(900);
  let d = await ev(page, () => DREncyclopedia._debug());
  ok(info.first[0] === 'mackerel' && info.first[1] === 'cod', 'thứ tự gốc: #1 mackerel, #2 cod (allFish)');
  ok(d.pages[0].title === '#1 ???' && d.pages[1].title === '#2 Cod', 'trang 1: "' + d.pages[0].title + '" | "' + d.pages[1].title + '" (video: "#1 ???" / "#2 Cod")');
  ok(d.counter === 'PAGE 1/' + Math.ceil(info.n / 2), 'đếm trang ' + d.counter);
  ok(d.discovered === 'Discovered: 1/' + info.n, 'đếm khám phá ' + d.discovered);
  ok(d.pages[0].caught === 'Not Caught' && d.pages[1].caught === '3 Caught', 'số con bắt: "' + d.pages[0].caught + '" / "' + d.pages[1].caught + '"');
  ok(d.pages[0].desc === '???' && /Plentiful/.test(d.pages[1].desc), 'mô tả: ??? và "Plentiful and basic."');
  ok(d.pages[0].value === '???' && d.pages[1].value === '18.00', 'giá cá tuyết sau khi bán: ' + d.pages[1].value + ' (video 18.00)');
  ok(d.pages[0].size === '-' && d.pages[1].size === '78.60 cm', 'kích thước lớn nhất: ' + d.pages[1].size + ' (video 78.60 cm)');
  ok(d.pages[1].type === 'COASTAL', 'thẻ loại COASTAL');
  ok(d.pages[1].aber.join() === info.codAb.join(), 'cá tuyết có 3 huy chương aberration: ' + d.pages[1].aber.join());
  ok(!d.prev && d.next, 'trang 1: không có mũi tên lùi, có mũi tên tiến');
  near(d.pages[0].rect.w, 650 * s, 1.5, 'trang trái rộng 650'); near(d.pages[0].rect.h, 900 * s, 1.5, 'trang cao 900');
  near(d.title.h, 80 * s, 1.5, 'ruy băng "Encyclopedia" cao 80');
  ok(d.types.slice(0, 5).map(t => t.text).join() === 'COASTAL,SHALLOW,OCEANIC,ABYSSAL,HADAL', 'nút loại: ' + d.types.map(t => t && t.text).join(','));
  ok(d.zones.slice(0, 5).map(t => t.text).join() === "The Marrows,Gale Cliffs,Stellar Basin,Twisted Strand,Devil's Spine", 'nút vùng: ' + d.zones.map(t => t && t.text).join(','));
  ok(d.zones[0].wide && !d.zones[1].wide, 'nút The Marrows to ra 250 (cá trên trang ở The Marrows)');
  near(d.zones[0].rect.w, 250 * s, 1, 'nút vùng chọn rộng 250'); near(d.zones[1].rect.w, 200 * s, 1, 'nút vùng thường rộng 200');
  await page.screenshot({ path: path.join(OUT, 'enc-' + tag + '.png') });

  await page.keyboard.press('KeyE'); await sleep(500);
  d = await ev(page, () => DREncyclopedia._debug());
  ok(/^#3 /.test(d.pages[0].title) && /^#4 /.test(d.pages[1].title) && d.counter === 'PAGE 2/' + Math.ceil(info.n / 2), 'E sang trang 2: ' + d.pages[0].title + ' | ' + d.pages[1].title + ' | ' + d.counter);
  ok(d.prev, 'trang 2 có mũi tên lùi');
  await page.keyboard.press('KeyQ'); await sleep(400);
  d = await ev(page, () => DREncyclopedia._debug());
  ok(d.pages[1].title === '#2 Cod', 'Q lùi về trang 1');
  // nút loại: bấm COASTAL ở bên trái → chỉ cá COASTAL
  const ct = d.types[0].rect;
  await page.mouse.click(ct.x + ct.w / 2, ct.y + ct.h / 2); await sleep(500);
  d = await ev(page, () => DREncyclopedia._debug());
  ok(d.view.total === info.coastal && d.discovered === 'Discovered: 1/' + info.coastal, 'lọc COASTAL còn ' + d.view.total + ' loài (gốc ' + info.coastal + '): ' + d.discovered);
  ok(d.counter === 'PAGE 1/' + Math.ceil(info.coastal / 2), 'đếm trang sau lọc ' + d.counter);
  const ct2 = d.types[0].rect;
  await page.mouse.click(ct2.x + ct2.w / 2, ct2.y + ct2.h / 2); await sleep(400);
  d = await ev(page, () => DREncyclopedia._debug());
  ok(d.view.total === info.n, 'bấm lại COASTAL thì trở về đủ loại (' + d.view.total + ')');
  // nút vùng: Gale Cliffs → con cá đầu tiên của vùng, trang chẵn
  const gz = d.zones[1].rect;
  await page.mouse.click(gz.x + gz.w / 2, gz.y + gz.h / 2); await sleep(500);
  d = await ev(page, () => DREncyclopedia._debug());
  ok(d.view.left === info.galeId && d.cur === (info.gale - info.gale % 2), 'nút Gale Cliffs nhảy tới ' + info.galeId + ' (' + d.view.left + ')');
  ok(d.zones[1].wide, 'nút Gale Cliffs to ra khi cá thuộc vùng đó');
  // huy chương aberration: quay về cá tuyết rồi bấm cod-ab-1
  await ev(page, () => DREncyclopedia._go('cod'));
  await sleep(500);
  d = await ev(page, () => DREncyclopedia._debug());
  const k = d.pages.findIndex(p => p.title && /Cod$/.test(p.title));
  const ab = await ev(page, i => { const p = document.querySelectorAll('#dr-enc [data-path*="PageLeft"], #dr-enc [data-path*="PageRight"]'); void p; const q = document.querySelectorAll('#dr-enc .enc-aber'); const r = []; q.forEach(b => { const b2 = b.getBoundingClientRect(); if (b.offsetParent) r.push({ id: b.dataset.id, x: b2.left + b2.width / 2, y: b2.top + b2.height / 2 }); }); return r; }, k);
  const target = ab.find(a => a.id === 'cod-ab-1');
  ok(!!target, 'huy chương cod-ab-1 có trên trang');
  if (target) {
    await page.mouse.click(target.x, target.y); await sleep(500);
    d = await ev(page, () => DREncyclopedia._debug());
    ok(d.pages.some(p => p.title && /^#\d+ \?\?\?$/.test(p.title)) && d.view.left === 'cod-ab-1' || d.view.right === 'cod-ab-1', 'bấm huy chương nhảy tới trang cod-ab-1 (' + d.view.left + ' | ' + d.view.right + ')');
    const sec = d.view.left === 'cod-ab-1' ? d.pages[0] : d.pages[1];
    ok(sec.aber.join() === 'cod', 'trang aberration chỉ có một huy chương trỏ về "cod": ' + sec.aber.join());
  }
  // ghi sổ: sự kiện catch và itemSold
  const rec = await ev(page, () => {
    DR.emit('catch', { id: 'mackerel', item: DR_ITEMS.mackerel, size: 0.5, isNew: true });
    DR.emit('catch', { id: 'mackerel', item: DR_ITEMS.mackerel, size: 0.3, isNew: false });
    DR.emit('itemSold', 'mackerel', 5);
    return { l: DR.s.vars['enc-largest-mackerel'], u: DR.s.vars['enc-last-unseen'], s: DR.s.vars['enc-sold-mackerel'] };
  });
  ok(rec.l === 0.5 && rec.u === 'mackerel' && rec.s === 1, 'catch ghi cỡ lớn nhất (giữ 0,5 khi con sau nhỏ hơn), loài mới và số lần bán: ' + JSON.stringify(rec));
  await page.keyboard.press('Escape'); await sleep(500);
  ok(!(await ev(page, () => DREncyclopedia.isOpen())), 'Esc đóng sách');
  // mở lại: nhảy tới loài vừa thấy lần đầu (LastUnseenCaughtSpecies) rồi xoá cờ
  await ev(page, () => { DR.s.caught.mackerel = 1; });
  await page.keyboard.press('KeyL'); await sleep(700);
  d = await ev(page, () => DREncyclopedia._debug());
  const mk = await ev(page, () => DR_ITEMS.mackerel);
  ok(d.pages[0].title === '#1 ' + mk.name && d.pages[0].caught === '1 Caught', 'mở lại sách nhảy tới loài mới: ' + d.pages[0].title);
  ok(await ev(page, () => !DR.s.vars['enc-last-unseen']), 'cờ loài mới được xoá');
  const cm = mk.minSizeCentimeters + (mk.maxSizeCentimeters - mk.minSizeCentimeters) * 0.5;
  ok(d.pages[0].size === (cm > 100 ? (cm / 100).toFixed(2) + ' m' : (Math.round(cm * 10) / 10).toFixed(2) + ' cm'), 'cỡ lớn nhất của mackerel ' + d.pages[0].size + ' (' + cm + ' cm)');
  await page.keyboard.press('Escape'); await sleep(300);
}

(async () => {
  const srv = await serve(), base = process.env.DR_URL || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  let errors = [];
  for (const [vw, vh, tag] of [[1920, 1080, '1080'], [844, 390, 'phone']]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
    const page = await ctx.newPage();
    errors = errors.concat(watch(page));
    await load(page, base);
    await newGame(page);
    await toSea(page);
    await mapTests(page, vw, vh, tag);
    await encTests(page, vw, vh, tag);
    await ctx.close();
  }
  const uniq = [...new Set(errors)];
  ok(uniq.length === 0, 'không có pageerror / console.error / HTTP >= 400' + (uniq.length ? ': ' + uniq.slice(0, 5).join(' ; ') : ''));
  console.log('\n' + pass + ' pass, ' + fail + ' fail -> ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
