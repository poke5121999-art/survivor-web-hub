/*
 * DREDGE — Biển Mù, r2fish (audit fishing.md F2, F9): con cá vừa bắt nằm trên CON TRỎ, khoang docked mở sẵn bên phải, khay tạm 6x3.
 *
 * Chạy:  node test/dredge-r2fish.js            (máy chủ tĩnh ở gốc bản sao; Playwright như test/dredge-suite.js)
 *        R2FISH_BASE=<bản sao cũ, vd D:/dredge-wt/_base3>  để đo hiệu năng trước/sau (mặc định bỏ qua)
 * Ảnh:   %TEMP%/dredge-r2fish/<rộng>x<cao>-*.png, ảnh ghép cạnh gog_04 ở sbs-*.png
 * Kiểm bằng phím/chuột thật (page.keyboard / page.mouse), số mong đợi viết thẳng từ bản gốc:
 *   - Harvester.OnEnable -> ToggleInventorySolo(true): vào điểm là khoang (chỉ tab INVENTORY) hiện bên phải, không che màn, DR.mode giữ 'harvest';
 *     PlayerSlidePanel 650x935 ở y −65 sát mép phải (1920x1080: x 1270..1920, y 65..1000);
 *   - HarvestMinigameView.SpawnItem: AddItemOfTypeToCursor(BEING_HARVESTED): cá trên con trỏ, khoang KHÔNG đổi số món;
 *     startMinigameAction bị tắt (OnItemPickedUp): nút bắt đầu ẩn, Space không thả cần; Harvester: Esc không rời khi đang cầm;
 *   - đặt bằng chuột trái vào ô trống -> món vào khoang, nút bắt đầu trở lại (RefreshHarvestTarget sau OnItemPlaceComplete);
 *   - giữ Z 0,75 s (DefaultActionHandler.defaultDiscardHoldTimeSec) vứt được món BEING_HARVESTED, fish-discard-count +1;
 *   - khay: storageTrayUnlockQuest = Quest_Intro (Game.unity, world_data.js); chưa xong thì không có khay; xong rồi thì sau con đầu
 *     khay trượt xuống 0,75 s dưới bảng câu: Container/StorageTray anchor (0,0)-(1,0), pivot (0.5,1), sd (−260,245) -> 460x245,
 *     x 130..590, y 700..945 ở 1920x1080; rời điểm -> ResetStorageTray: đồ trong khay mất, cá tính là vứt.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r2fish');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// tệp r2fish đổi: bản "trước" lấy từ R2FISH_BASE để đo hiệu năng
const OWNED = ['js/spots.js', 'js/minigame.js', 'js/cargo.js', 'css/minigame.css', 'art/ui/minigame/harvest_ui.js'];
function baseFiles() {
  const o = {};
  if (!process.env.R2FISH_BASE) return o;
  for (const f of OWNED) { const q = path.join(process.env.R2FISH_BASE, 'games/dredge', f); if (fs.existsSync(q)) o['/games/dredge/' + f] = fs.readFileSync(q); }
  return o;
}
function serve(over) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (over && over[u]) { r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'text/plain' }); r.end(over[u]); return; }
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 240)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
async function boot(browser, base, W, H) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = watch(page);
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__aud = []; window.__catch = []; window.__destroyed = [];
    const p0 = DRAudio.play;
    DRAudio.play = function (k) { __aud.push(k); return p0.apply(this, arguments); };
    DR.on('catch', m => __catch.push({ id: m.id, placed: m.placed, isNew: m.isNew }));
    DR.on('itemDestroyed', (d, i, byPlayer) => __destroyed.push({ id: d.id, byPlayer }));
  });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 10000 });
  await page.evaluate(() => DR.setMode('sail'));
  await sleep(600);
  return { page, errs };
}

// bot FISHING_RADIAL: bấm Space thật khi kim nằm giữa mục tiêu (đọc DRMinigame._debug()), nếu không thì tiến độ thụ động tự đầy
async function winRadial(page) {
  const t0 = Date.now();
  let last = 0;
  while (Date.now() - t0 < 60000) {
    const d = await page.evaluate(() => { const g = DRMinigame._debug(); return g && { phase: g.phase, angle: g.angle, targets: g.targets, hitThis: g.hitThis, penalty: g.penalty, trophyShowing: g.trophyShowing }; });
    if (!d || d.phase !== 'running') break;
    if (d.penalty <= 0 && Date.now() - last > 120 && d.targets.some((t, i) => !d.hitThis.includes(i) && !(t.special && !d.trophyShowing) && d.angle > t.a - t.w / 2 + 4 && d.angle < t.a + t.w / 2 - 4)) {
      await page.keyboard.press('Space'); last = Date.now();
    }
    await sleep(8);
  }
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H, big = W === 1920;
  out.push('\n[' + tag + ']');
  const shot = n => page.screenshot({ path: path.join(SHOTS, tag + '-' + n + '.png') });
  const { page, errs } = await boot(browser, base, W, H);
  const dbg = () => page.evaluate(() => DRCargo._debug());
  const invN = () => page.evaluate(() => DR.s.grids.INVENTORY.items.length);
  const frameOn = () => page.evaluate(() => getComputedStyle(DRMinigame.node('Frame').el).display !== 'none');
  // ô trống cho món đang cầm: G.findSpot rồi tâm hộp bao dấu chân (cargo.js đặt tâm món đúng con trỏ)
  const freePx = async key => {
    const c = await page.evaluate(k => {
      const held = DRCargo.held(), def = DR.item(held.id), dk = DRCargo._debug(), gr = dk.grids.find(g => g.key === k);
      const g = k === 'INVENTORY' ? DR.grid(k) : DRGrid.create(DR_GRIDS.StorageTray);
      const s = DRGrid.findSpot(g, def, 0, false);
      if (!s) return null;
      const f = DRGrid.footprint(def, s.x, s.y, 0), xs = f.map(q => q[0]), ys = f.map(q => q[1]);
      return { x: gr.x + (Math.min(...xs) + Math.max(...xs) + 1) / 2 * dk.cs, y: gr.y + (Math.min(...ys) + Math.max(...ys) + 1) / 2 * dk.cs, rot: held.rot || 0 };
    }, key);
    return c;
  };
  const click = async p => { await page.mouse.move(p.x, p.y, { steps: 6 }); await sleep(80); await page.mouse.down(); await page.mouse.up(); await sleep(200); };
  const catchOne = async () => {
    await page.keyboard.press('Space');
    await page.waitForFunction(() => DRMinigame.phase() === 'running', null, { timeout: 4000 }).catch(() => {});
    await winRadial(page);
    await page.waitForFunction(() => DRCargo.held(), null, { timeout: 30000 }).catch(() => {});
    await sleep(150);
  };

  // điểm cá thu gần cảng, ban ngày, kho 4
  await page.evaluate(() => { DR_DEBUG.give('tir-rod1'); DRBoat.refresh(); DR_DEBUG.setTime(0.4); });
  const sp = await page.evaluate(() => DR_DEBUG.spotNear(['mackerel'], 0, 0));
  await page.evaluate(s => { DR_DEBUG.setTime(0.4); const o = DR.s.spots[s.id] || (DR.s.spots[s.id] = {}); o.stock = 4; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, sp);
  await page.waitForFunction(() => DR.view.nearSpot && DR.view.nearSpot.status === 'ok', null, { timeout: 8000 }).catch(() => {});
  await sleep(600);
  const inv0 = await invN();

  // ---- vào điểm: khoang docked bên phải
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest' && DRCargo.isOpen(), null, { timeout: 5000 }).catch(() => {});
  await sleep(2600);
  const e1 = await page.evaluate(() => { const r = document.querySelector('#dr-cargo .cg-right'), d = DRCargo._debug(); const b = r && r.getBoundingClientRect();
    return { open: DRCargo.isOpen(), docked: d && d.docked, tab: d && d.rightTab, left: d && d.leftKind, mode: DR.mode, phase: DRMinigame.phase(), rect: b && [b.left, b.top, b.width, b.height].map(v => Math.round(v * 10) / 10),
      bg: getComputedStyle(document.querySelector('#dr-cargo')).backgroundColor, tabs: [...document.querySelectorAll('#dr-cargo .cg-right .cg-tab')].length }; });
  check('[' + tag + '] vào điểm: khoang docked mở (tab INVENTORY, 1 tab), không che màn, mode harvest, panel câu chờ, chưa có khay',
    e1.open && e1.docked && e1.tab === 'INVENTORY' && e1.tabs === 1 && e1.bg === 'rgba(0, 0, 0, 0)' && e1.mode === 'harvest' && e1.phase === 'prestart' && !e1.left, JSON.stringify(e1));
  if (big) check('[' + tag + '] khoang = PlayerSlidePanel 650x935, y −65, sát mép phải: rect [1270, 65, 650, 935]',
    e1.rect && Math.abs(e1.rect[0] - 1270) < 1.5 && Math.abs(e1.rect[1] - 65) < 1.5 && Math.abs(e1.rect[2] - 650) < 1.5 && Math.abs(e1.rect[3] - 935) < 1.5, JSON.stringify(e1.rect));
  else check('[' + tag + '] khoang nằm nửa phải, không đè bảng câu', e1.rect && e1.rect[0] > await page.evaluate(() => DRMinigame.nodeRect('').right) - 1 && e1.rect[0] + e1.rect[2] <= W + 1, JSON.stringify(e1.rect));
  await shot('1-prestart');
  if (big) await page.screenshot({ path: path.join(SHOTS, 'web-prestart.png') });

  // ---- câu con đầu: cá lên con trỏ
  await page.keyboard.press('Space');
  await sleep(1500);
  if (big) await page.screenshot({ path: path.join(SHOTS, 'web-running.png') });
  await shot('2-running');
  await winRadial(page);
  await page.waitForFunction(() => DRCargo.held(), null, { timeout: 30000 }).catch(() => {});
  await sleep(250);
  const c1 = await page.evaluate(() => { const d = DRCargo._debug(); return { held: d.held, phase: DRMinigame.phase(), running: DRMinigame.isOpen(), catches: __catch.slice(), banner: !!(window.DRBanner && DRBanner._debug().showing),
    pick: __aud.filter(k => /ui\.grid\.pick/.test(k)).length, left: d.leftKind }; });
  check('[' + tag + '] bắt xong: món trên con trỏ (held = ' + (c1.held && c1.held.id) + ', src harvest, BEING_HARVESTED), cùng id với sự kiện catch',
    !!c1.held && c1.held.src === 'harvest' && c1.held.st === 'BEING_HARVESTED' && c1.catches.length === 1 && c1.catches[0].id === c1.held.id && c1.catches[0].placed === false, JSON.stringify(c1));
  check('[' + tag + '] bắt xong: khoang KHÔNG đổi số món (' + inv0 + ')', await invN() === inv0, '' + await invN());
  check('[' + tag + '] bắt xong: banner loài mới bật ngay lúc bắt, tiếng nhấc đồ (GridObjectAudio.OnItemPickedUp)', c1.banner && c1.catches[0].isNew && c1.pick === 1, JSON.stringify({ banner: c1.banner, pick: c1.pick }));
  check('[' + tag + '] bắt xong: chưa xong Quest_Intro -> không có khay', !c1.left, '' + c1.left);
  check('[' + tag + '] đang cầm: nút bắt đầu ẩn, panel ở "held", minigame không chạy', !(await frameOn()) && c1.phase === 'held' && !c1.running, c1.phase);
  await page.mouse.move(W * 0.62, H * 0.45, { steps: 4 });
  await sleep(200);
  await shot('3-held');
  if (big) await page.screenshot({ path: path.join(SHOTS, 'web-held.png') });
  await page.keyboard.press('Space');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(300);
  const c2 = await page.evaluate(() => ({ phase: DRMinigame.phase(), mode: DR.mode, held: !!DRCargo.held(), open: DRCargo.isOpen() }));
  check('[' + tag + '] đang cầm: Space không thả cần, Esc không rời điểm (Harvester.OnLeaveActionPressed)', c2.phase === 'held' && c2.mode === 'harvest' && c2.held && c2.open, JSON.stringify(c2));

  // ---- đặt bằng chuột trái vào ô trống
  const p1 = await freePx('INVENTORY');
  await click(p1);
  const c3 = await page.evaluate(() => ({ held: DRCargo.held(), phase: DRMinigame.phase(), last: DR.s.grids.INVENTORY.items.slice(-1)[0], hint: getComputedStyle(DRMinigame.node('HintImage').el).display !== 'none' }));
  check('[' + tag + '] chuột trái vào ô trống: món vào khoang (' + inv0 + ' -> ' + (await invN()) + '), hết cầm', c3.held === null && await invN() === inv0 + 1 && c3.last && c3.last.id === c1.held.id, JSON.stringify(c3.last && { id: c3.last.id, x: c3.last.x, y: c3.last.y }));
  check('[' + tag + '] sau khi đặt: nút bắt đầu + bóng gợi ý trở lại, panel chờ con kế', c3.phase === 'prestart' && await frameOn() && c3.hint, c3.phase);

  // ---- con thứ hai: giữ Z vứt
  const disc0 = await page.evaluate(() => DR.s.vars['fish-discard-count'] || 0);
  await catchOne();
  const n2 = await invN();
  await page.keyboard.down('KeyZ'); await sleep(450);
  const midZ = await page.evaluate(() => !!DRCargo.held());
  await sleep(500); await page.keyboard.up('KeyZ'); await sleep(250);
  const c4 = await page.evaluate(() => ({ held: DRCargo.held(), phase: DRMinigame.phase(), disc: DR.s.vars['fish-discard-count'] || 0 }));
  check('[' + tag + '] con thứ hai: giữ Z 0,45 s chưa vứt, giữ quá 0,75 s thì vứt (fish-discard-count ' + disc0 + ' -> ' + c4.disc + '), khoang không đổi',
    midZ && c4.held === null && c4.disc === disc0 + 1 && await invN() === n2, JSON.stringify(c4));
  check('[' + tag + '] sau khi vứt: panel chờ, nút bắt đầu trở lại', c4.phase === 'prestart' && await frameOn(), c4.phase);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 4000 }).catch(() => {});
  check('[' + tag + '] con trỏ trống: Esc rời điểm, khoang docked đóng', await page.evaluate(() => DR.mode === 'sail' && !DRCargo.isOpen() && !DRSpots.cur));

  // ---- khay tạm sau Quest_Intro
  await page.evaluate(s => { DRQuests.complete('Quest_Intro', 0, true); const o = DR.s.spots[s.id]; o.stock = 4; o.lastUpdate = DR.s.time; DR_DEBUG.teleport(s.x + s.r + 0.6, s.z, 0); }, sp);
  await page.waitForFunction(() => DR.view.nearSpot && DR.view.nearSpot.status === 'ok', null, { timeout: 8000 }).catch(() => {});
  await sleep(400);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest' && DRCargo.isOpen(), null, { timeout: 5000 }).catch(() => {});
  await sleep(1200);
  check('[' + tag + '] Quest_Intro xong, chưa bắt con nào: chưa có khay', await page.evaluate(() => !DRCargo._debug().leftKind && !document.querySelector('.cg-tray')));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DRMinigame.phase() === 'running', null, { timeout: 4000 }).catch(() => {});
  // ghi đỉnh khay mỗi khung từ lúc nó xuất hiện (đo trong trang, không phụ thuộc độ trễ của Playwright)
  await page.evaluate(() => { window.__trayS = []; let t0 = 0; const f = now => { const t = document.querySelector('.cg-tray'); if (t) { if (!t0) t0 = now; __trayS.push([now - t0, t.getBoundingClientRect().top]); } if (!t0 || now - t0 < 1200) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await winRadial(page);
  await page.waitForFunction(() => DRCargo.held(), null, { timeout: 30000 }).catch(() => {});
  await sleep(1400);
  const slide = await page.evaluate(() => { const s = __trayS, end = s.length ? s[s.length - 1][1] : 0, at = ms => (s.find(x => x[0] >= ms) || [0, end])[1];
    return { n: s.length, first: s.length ? s[0][1] : null, at100: at(100), at375: at(375), end, mono: s.every((x, i) => !i || x[1] >= s[i - 1][1] - 0.01) }; });
  const tr = await page.evaluate(() => { const t = document.querySelector('.cg-tray'), b = t && t.getBoundingClientRect(), d = DRCargo._debug(), g = d.grids.find(q => q.key === 'STORAGE_TRAY');
    return { left: d.leftKind, rect: b && [b.left, b.top, b.width, b.height].map(v => Math.round(v * 10) / 10), cols: g && g.cols, rows: g && g.rows, held: !!d.held, panel: DRMinigame.nodeRect('').bottom }; });
  check('[' + tag + '] con đầu của phiên: khay 6x3 (DR_GRIDS.StorageTray) hiện, món vẫn trên con trỏ', tr.left === 'tray' && tr.cols === 6 && tr.rows === 3 && tr.held, JSON.stringify(tr));
  // DOAnchorPos((0,245) -> 0, 0,75 s, OutExpo): khung đầu lệch lên gần trọn chiều cao, đi xuống đều, ~0,375 s đã qua > 90 %
  check('[' + tag + '] khay trượt xuống từ sau bảng câu (đỉnh đi xuống liên tục, khung đầu lệch ≥ 60 % chiều cao, 0,375 s đã qua ≥ 90 %)',
    slide.n > 5 && slide.mono && tr.rect && slide.end - slide.first >= tr.rect[3] * 0.6 && (slide.at375 - slide.first) >= (slide.end - slide.first) * 0.9 && Math.abs(slide.end - tr.rect[1]) < 1.5, JSON.stringify(slide));
  if (big) check('[' + tag + '] khay = Container/StorageTray 460x245 dưới đáy bảng câu: rect [130, 700, 460, 245]',
    tr.rect && Math.abs(tr.rect[0] - 130) < 1.5 && Math.abs(tr.rect[1] - 700) < 1.5 && Math.abs(tr.rect[2] - 460) < 1.5 && Math.abs(tr.rect[3] - 245) < 1.5, JSON.stringify(tr.rect));
  else check('[' + tag + '] khay treo đúng đáy bảng câu (không đè nút), trong màn', tr.rect && Math.abs(tr.rect[1] - tr.panel) < 1.5 && tr.rect[1] + tr.rect[3] <= H + 1, JSON.stringify(tr));
  const p2 = await freePx('STORAGE_TRAY');
  await click(p2);
  const c5 = await page.evaluate(() => { const d = DRCargo._debug(), g = d.grids.find(q => q.key === 'STORAGE_TRAY'); return { held: d.held, tray: g && g.items.map(i => i.id), help: !!document.querySelector('.cg-trayhelp.on'), phase: DRMinigame.phase() }; });
  check('[' + tag + '] đặt vào khay: món nằm trong STORAGE_TRAY, nhắc "Đồ để lại đây sẽ mất." hiện, panel chờ', c5.held === null && c5.tray && c5.tray.length === 1 && c5.help && c5.phase === 'prestart', JSON.stringify(c5));
  await shot('4-tray');
  if (big) await page.screenshot({ path: path.join(SHOTS, 'web-tray.png') });
  const before = await page.evaluate(() => ({ disc: DR.s.vars['fish-discard-count'] || 0, n: DR.s.grids.INVENTORY.items.length, d: __destroyed.length, a: __aud.length }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 4000 }).catch(() => {});
  await sleep(200);
  const c6 = await page.evaluate(a => ({ mode: DR.mode, open: DRCargo.isOpen(), disc: DR.s.vars['fish-discard-count'] || 0, n: DR.s.grids.INVENTORY.items.length, destroyed: __destroyed.slice(), drop: __aud.slice(a).filter(k => /ui\.grid\.(drop|discard)/.test(k)) }), before.a);
  // ResetStorageTray: TriggerItemDestroyed(playerDestroyed: false) nên không có tiếng vứt
  check('[' + tag + '] rời điểm còn đồ trong khay: đồ mất (1 itemDestroyed, không tiếng vứt), cá tính là vứt, khoang không đổi',
    c6.mode === 'sail' && !c6.open && c6.disc === before.disc + 1 && c6.n === before.n && c6.destroyed.length === before.d + 1 && c6.drop.length === 0, JSON.stringify(c6));
  await page.evaluate(() => DR_DEBUG.teleport(DR.s.boat.x + 30, DR.s.boat.z, 0));
  await sleep(300);

  check('[' + tag + '] không có pageerror / console error / HTTP >= 400', errs.length === 0, errs.slice(0, 5).join(' | '));
  await page.close();
}

async function perf(browser, over) {
  const srv = await serve(over), base = 'http://127.0.0.1:' + srv.address().port;
  const { page } = await boot(browser, base, 1280, 720);
  await page.evaluate(() => DR_DEBUG.teleport(20, -30, 0.3));
  await sleep(1500);
  const r = [];
  for (let i = 0; i < 3; i++) { await sleep(2500); r.push((await page.evaluate(() => DR_DEBUG.perf())).cpuMs); }
  await page.close(); srv.close();
  return Math.min(...r);
}

(async () => {
  // DR_URL=https://poke5121999-art.github.io/survivor-web-hub để chạy trên Pages
  const srv = await serve(), base = process.env.DR_URL || 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try {
    await run(browser, base, 1920, 1080);
    await run(browser, base, 844, 390);
    out.push('\n[ảnh ghép cạnh gog_04]');
    const q = s => '"' + s + '"';
    for (const [w, n] of [['web-running.png', 'sbs-running-gog04.png'], ['web-held.png', 'sbs-held-gog04.png'], ['web-tray.png', 'sbs-tray-gog04.png']]) {
      let ok = false;
      try { cp.execSync(['python', '-I', q('D:/dredge-ref/notes/sbs.py'), q(path.join(SHOTS, w)), q('D:/dredge-ref/shots-real/gog_04.jpg'), q(path.join(SHOTS, n))].join(' '), { stdio: 'ignore' }); ok = fs.existsSync(path.join(SHOTS, n)); } catch (e) { ok = false; }
      check('ảnh ghép ' + n, ok, path.join(SHOTS, n));
    }
    const over = baseFiles();
    if (Object.keys(over).length) {
      const now = [], was = [];
      for (let i = 0; i < 2; i++) { now.push(await perf(browser, null)); was.push(await perf(browser, over)); }
      const n = Math.min(...now), w = Math.min(...was);
      out.push('\n[hiệu năng 1280x720, CPU/khung ms] bản này ' + n.toFixed(2) + ' (' + now.map(v => v.toFixed(2)).join('/') + '), bản trước ' + w.toFixed(2) + ' (' + was.map(v => v.toFixed(2)).join('/') + ')');
      check('khung hình không tệ hơn 15%', n <= w * 1.15 + 0.15, 'tỉ lệ ' + (n / w).toFixed(2));
    } else out.push('\n[hiệu năng] bỏ qua: không có R2FISH_BASE');
  } catch (e) {
    fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e));
  }
  await browser.close();
  srv.close();
  console.log('DREDGE r2fish — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
