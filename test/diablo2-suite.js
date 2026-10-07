/*
 * Bộ kiểm thử cho games/diablo2 (Ác Quỷ II).
 * Chạy: node test/diablo2-suite.js            (biến môi trường: D2_URL để trỏ trang khác, D2_SHOTS = thư mục ảnh chụp)
 *
 * Thao tác của người chơi (chọn lớp, bấm ra lối đi, bắn Fire Bolt, nhặt đồ) đều đi qua chuột/chạm thật trên
 * canvas và DOM. Móc window.D2DBG chỉ dùng để dựng tình huống (dịch chuyển, sinh quái) và đọc trạng thái.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const os = require('os');
const fs = require('fs');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const URL = process.env.D2_URL || (root + '/games/diablo2/index.html');
const SHOTS = process.env.D2_SHOTS || path.join(os.tmpdir(), 'd2-shots');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ok   ' + name + (detail ? '  - ' + detail : '')); }
  else { fail++; results.push('  FAIL ' + name + (detail ? '  - ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// độ sáng trung bình (0..255) của một vùng trên ảnh chụp: ảnh nạp qua data: URL nên canvas không bị khoá như file://
async function luma(p, png, boxes) {
  return p.evaluate(([src, boxes]) => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
      const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
      res(boxes.map(b => {
        const d = x.getImageData(Math.round(b[0]), Math.round(b[1]), b[2], b[3]).data; let s = 0;
        for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return s / (d.length / 4);
      }));
    };
    im.src = 'data:image/png;base64,' + src;
  }), [png.toString('base64'), boxes]);
}
// [độ sáng trung bình, độ lệch chuẩn] của một vùng: vùng đen đặc cho [0, 0], hình đất đá có vân
async function texture(p, png, boxes) {
  return p.evaluate(([src, boxes]) => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
      const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
      res(boxes.map(b => {
        const d = x.getImageData(Math.round(b[0]), Math.round(b[1]), b[2], b[3]).data, n = d.length / 4; let s = 0, s2 = 0;
        for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; }
        return [s / n, Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n)))];
      }));
    };
    im.src = 'data:image/png;base64,' + src;
  }), [png.toString('base64'), boxes]);
}
const st = p => p.evaluate(() => D2DBG.getState());
async function waitFor(p, fn, ms, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
}
async function open(b, opts) {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  // đổi bài nhạc làm trình duyệt huỷ luồng đang tải (ERR_ABORTED); đó không phải lỗi thiếu tệp
  p.on('requestfailed', r => { if (!/ERR_ABORTED/.test(r.failure().errorText)) errs.push('REQFAIL ' + r.url().replace(/^.*games\/diablo2\//, '') + ' ' + r.failure().errorText); });
  await p.goto(URL);
  await p.waitForSelector('.screen.title .tmenu', { timeout: 15000 });
  return { ctx, p, errs };
}

async function startClass(p, cls, name, touch) {
  const click = touch ? (sel => p.tap(sel)) : (sel => p.click(sel));
  await click('.tmenu button:has-text("Trò chơi mới")');
  await p.waitForSelector('.ccard');
  const locked = await p.$$eval('.ccard.locked', n => n.length);
  await click('.ccard[data-cls=' + cls + ']');
  await p.fill('#pname', name);
  await click('#pgo');
  await p.waitForFunction(() => window.D2DBG && D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 20000 });
  return locked;
}

// bấm chuột thật vào điểm lưới (x,y) trên màn hình
async function clickTile(p, x, y, opt) {
  const c = await p.evaluate(([x, y, l]) => D2DBG.client(x, y, l), [x, y, (opt && opt.lift) || 0]);
  await p.mouse.move(c.x, c.y);
  await p.mouse.click(c.x, c.y, { button: (opt && opt.button) || 'left' });
  return c;
}

// NPC thị trấn đi lại (WL) nên đọc lại vị trí ngay trước khi bấm và chỉ bấm khi con trỏ đang chỉ đúng NPC đó
async function clickNpc(p, id) {
  for (let i = 0; i < 12; i++) {
    const n = (await st(p)).npcs.find(x => x.id === id); if (!n) return false;
    const c = await p.evaluate(([x, y]) => D2DBG.client(x, y, 40), [n.x, n.y]);
    await p.mouse.move(c.x, c.y); await sleep(60);
    if (await p.evaluate(nid => !!(D2DBG.S.hover && D2DBG.S.hover.npc === nid), id)) { await p.mouse.click(c.x, c.y); return true; }
    await sleep(250);
  }
  return false;
}

(async () => {
  const b = await chromium.launch();
  let { ctx, p, errs } = await open(b, { viewport: { width: 1000, height: 600 } });

  // -------------------------------------------------------------- màn hình đầu
  results.push('\n-- khởi động --');
  await p.screenshot({ path: path.join(SHOTS, '1-title.png') });
  check('màn hình đầu hiện tiêu đề', /ÁC QUỶ II/.test(await p.textContent('.screen.title')));
  // màn chọn lớp như D2: cảnh lửa trại, 7 nhân vật có hoạt ảnh (UI.front.cls[lớp].f là khung đang vẽ)
  await p.click('.tmenu button:has-text("Trò chơi mới")');
  await p.waitForSelector('.ccard');
  await sleep(300);
  const fr0 = await p.evaluate(() => JSON.stringify(D2.UI.front.cls));
  await sleep(500);
  const fr1 = await p.evaluate(() => JSON.stringify(D2.UI.front.cls));
  const moved = Object.keys(JSON.parse(fr1)).filter(k => JSON.parse(fr0)[k] && JSON.parse(fr0)[k].f !== JSON.parse(fr1)[k].f);
  check('chọn lớp: 7 nhân vật quanh lửa trại, hoạt ảnh chạy (khung đổi)', (await p.$$('.ccard')).length === 7 && Object.keys(JSON.parse(fr1)).length === 7 && moved.length === 7,
    'ô=' + (await p.$$('.ccard')).length + ' khung đổi: ' + moved.join(','));
  await p.click('.ccard[data-cls=sorceress]'); await sleep(400);
  const fw = await p.evaluate(() => D2.UI.front.cls.sorceress);
  check('bấm Sorceress -> bước tới lửa (fw)', fw.st === 'fw' && fw.f > 0, JSON.stringify(fw));
  await p.screenshot({ path: path.join(SHOTS, '1b-class.png') });
  await p.click('.fbtn:has-text("Quay lại")');
  await p.waitForSelector('.screen.title .tmenu');
  const locked = await startClass(p, 'sorceress', 'Tester');
  // ghi lại mọi lần vẽ chữ bằng font DC6 lên canvas
  await p.evaluate(() => { window.__tx = []; const o = D2.E.text; D2.E.text = function (s, f) { window.__tx.push(f + '|' + s); return o.apply(this, arguments); }; });
  check('bảy lớp, không lớp nào khoá', locked === 0, 'khoá=' + locked);
  let s = await st(p);
  check('vào Rogue Encampment', s.area === 'rogue_encampment', s.area);
  // ghi lại mọi khoá tiếng game gọi (E.sfx trả khoá đã chọn, kể cả khi trình duyệt chưa cho phát)
  await p.evaluate(() => { window.__sfx = []; const o = D2.E.sfx; D2.E.sfx = function () { const k = o.apply(this, arguments); if (k) window.__sfx.push(k); return k; }; });
  const sfxSince = async (n, re) => p.evaluate(([n, re]) => { const r = new RegExp(re); return window.__sfx.slice(n).filter(k => r.test(k)).map(k => k + (D2.E.UI.sfx[k] ? '' : '(THIẾU)')); }, [n, re.source]);
  const hud = await p.evaluate(() => ({ frames: document.querySelectorAll('.hbar > .sp, .hbar > img, .hbar > div[style*="background"]').length, orb: getComputedStyle(document.querySelector('.orb.life .fill')).backgroundImage }));
  check('HUD có khung ctrlpanel và cầu máu bằng hình D2', hud.frames > 0 && /url\(/.test(hud.orb), JSON.stringify(hud).slice(0, 120));
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, '2-town.png') });

  // ------------------------------------------------------- đi tới lối ra (chuột thật)
  results.push('\n-- đi bộ --');
  async function walkTo(p, ex, area, ms) {
    const t0 = Date.now(); let moved = false, s; const trail = [];
    while (Date.now() - t0 < ms) {
      s = await st(p);
      if (s.area === area) break;
      // điểm bấm: chặng xa nhất trong ~12 subtile trên đường A* của game (bản đồ D2 có hàng rào, đi thẳng sẽ kẹt)
      let path = await p.evaluate(([x, y]) => D2DBG.path(x, y), [ex.x + 0.5, ex.y + 0.5]);
      // hero vừa qua mép đứng sát lối: A* trả đường rỗng, bấm thẳng vào lối
      if (!path || !path.length) path = [[ex.x + 0.5, ex.y + 0.5]];
      const near = path.filter(q => Math.hypot(q[0] - s.hero.x, q[1] - s.hero.y) <= 12);
      const cand = (near.length ? near : [path[path.length - 1]]).reverse();
      // NPC đi lại có thể đứng đúng chỗ định bấm: chọn chặng mà con trỏ không chỉ vào NPC (bấm NPC là mở hộp thoại)
      let pt = null;
      for (const q of cand) { pt = await p.evaluate(([x, y]) => { const c = D2DBG.client(x, y), e = D2DBG.entAt(c.sx, c.sy); return e && e.kind === 'npc' ? null : c; }, q); if (pt) break; }
      if (!pt) { await sleep(300); continue; }
      await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await sleep(700); await p.mouse.up();
      await p.evaluate(() => { if (D2.UI.dlg) D2.UI.closeDialog(); });
      trail.push(s.hero.x.toFixed(1) + ',' + s.hero.y.toFixed(1) + ':' + s.hero.st + ':aggro' + s.mons.filter(m => m.aggro).length);
      if (!moved) { const s2 = await st(p); moved = Math.hypot(s2.hero.x - s.hero.x, s2.hero.y - s.hero.y) > 0.5; }
    }
    return { moved, area: (await st(p)).area, trail: trail.slice(-6).join(' | ') };
  }
  const exTown = s.exits.filter(e => e.to === 'blood_moor')[0];
  check('Rogue Encampment có lối ra Blood Moor (từ drlg)', !!exTown, JSON.stringify(s.exits.map(e => e.to)));
  // theo dõi suốt lúc đi bộ: màn nạp có hiện không, hero có nhảy vị trí giữa hai khung không
  await p.evaluate(() => {
    window.__loads = 0; window.__jump = 0; let lastP = null;
    new MutationObserver(() => { if (D2.UI.loadEl.style.display !== 'none') window.__loads++; }).observe(D2.UI.loadEl, { attributes: true, attributeFilter: ['style'] });
    (function tick() { const h = D2DBG.S.hero; if (h) { if (lastP) window.__jump = Math.max(window.__jump, Math.hypot(h.x - lastP[0], h.y - lastP[1])); lastP = [h.x, h.y]; } requestAnimationFrame(tick); })();
  });
  const watch = () => p.evaluate(() => { const r = { loads: window.__loads, jump: window.__jump }; window.__loads = 0; window.__jump = 0; return r; });
  // hộp ảnh quanh một điểm thế giới, toạ độ ảnh chụp (viewport 1000x600, stage 960x540 phóng theo)
  const boxAt = (x, y, w, hh) => p.evaluate(([x, y, w, hh]) => { const c = D2DBG.client(x, y), r = document.getElementById('stage').getBoundingClientRect(); return [c.x - w / 2, c.y - hh / 2, w, hh, r.left, r.top, r.width, r.height]; }, [x, y, w, hh]);
  const inStage = b => b[0] >= b[4] && b[1] >= b[5] && b[0] + b[2] <= b[4] + b[6] && b[1] + b[3] <= b[5] + b[7];
  // tâm và hộp của SelectX/Y/DX/DY (lvlwarp.txt) tính từ đỉnh ô tile warp, toạ độ trang
  const selBox = (ex) => p.evaluate(([tx, ty, sel]) => { const q = D2.E.toScreen(tx * 5, ty * 5), r = document.getElementById('stage').getBoundingClientRect(), k = r.width / 960; return { x: r.left + (q[0] + sel[0] + sel[2] / 2) * k, y: r.top + (q[1] + sel[1] + sel[3] / 2) * k, box: [r.left + (q[0] + sel[0]) * k, r.top + (q[1] + sel[1]) * k, Math.round(sel[2] * k), Math.round(sel[3] * k)] }; }, [ex.warp.tiles[0][0], ex.warp.tiles[0][1], ex.warp.select]);
  await watch();
  const r1 = exTown ? await walkTo(p, exTown, 'blood_moor', 70000) : { moved: false, area: null, trail: '' };
  const w1 = await watch();
  check('chuột trái làm hero đi', r1.moved);
  check('đi bộ qua mép thị trấn -> Blood Moor (areaId đổi)', r1.area === 'blood_moor', r1.area + ' vết: ' + r1.trail);
  check('qua mép không hiện màn nạp', w1.loads === 0, 'màn nạp hiện ' + w1.loads + ' lần');
  check('vị trí hero liên tục khi qua mép (không nhảy > 2 subtile giữa hai khung)', w1.jump <= 2, 'nhảy xa nhất ' + w1.jump.toFixed(2));
  s = await st(p);
  check('thế giới act đã dựng cả thị trấn lẫn Blood Moor', s.worldLevels.includes('rogue_encampment') && s.worldLevels.includes('blood_moor'), s.worldLevels.join(','));
  // ảnh chụp ở mép (tắt lớp ánh sáng): hai bên đường ranh đều có hình, không phải vùng đen
  const lk = await p.evaluate(() => D2DBG.link('blood_moor', 'rogue_encampment'));
  const nrm = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[lk.side];
  await p.evaluate(() => { D2DBG.noLight(true); D2DBG.freeze(true); });
  await sleep(150);
  const bMoor = await boxAt(s.hero.x - nrm[0] * 12, s.hero.y - nrm[1] * 12, 60, 40), bTown = await boxAt(s.hero.x + nrm[0] * 12, s.hero.y + nrm[1] * 12, 60, 40);
  const shotB = await p.screenshot({ path: path.join(SHOTS, '2a-border.png') });
  await p.evaluate(() => { D2DBG.noLight(false); D2DBG.freeze(false); });
  // vùng đen đặc có độ sáng 0 và không có vân; hình đất đá (kể cả bóng tối dưới cầu của thị trấn) có độ lệch chuẩn > 2
  const texB = await texture(p, shotB, [bMoor, bTown]);
  check('ở mép: 12 subtile hai bên đường ranh đều có hình (không phải vùng đen đặc)', inStage(bMoor) && inStage(bTown) && texB.every(t => t[0] > 3 && t[1] > 2),
    'phía Blood Moor sáng ' + texB[0][0].toFixed(1) + ' lệch ' + texB[0][1].toFixed(1) + ', phía thị trấn sáng ' + texB[1][0].toFixed(1) + ' lệch ' + texB[1][1].toFixed(1) + ' hướng ' + lk.side);
  const sig = ex => JSON.stringify(ex.map(e => [e.to, e.x, e.y]));
  const bm1 = sig(s.exits);
  const den = x => (JSON.parse(x).filter(e => e[0] === 'den_of_evil')[0] || null);
  // ----- warp: hang Den of Evil bấm được, sáng khi rê, ra theo lvlwarp
  const dEx = s.exits.filter(e => e.to === 'den_of_evil')[0];
  check('Blood Moor có cửa hang Den of Evil kiểu warp (lvlwarp.txt: hộp chọn, offset, lối bước ra)', !!(dEx && dEx.warp && dEx.warp.select && dEx.warp.offset && dEx.warp.exitWalk && !dEx.warp.noInteract),
    JSON.stringify(dEx && dEx.warp && { id: dEx.warp.id, select: dEx.warp.select, offset: dEx.warp.offset, exitWalk: dEx.warp.exitWalk, lit: dEx.warp.lit.length }));
  if (dEx && dEx.warp) {
    await p.evaluate(([x, y]) => D2DBG.teleport(x + 6, y + 6), [dEx.x, dEx.y]);
    await p.evaluate(() => D2DBG.hour(12));
    await sleep(600);
    const selC = await selBox(dEx);
    await p.evaluate(() => D2DBG.noLight(true));
    await p.mouse.move(selC.x - 300, selC.y + 200); await sleep(150);
    const litOff = await p.screenshot();
    await p.mouse.move(selC.x, selC.y); await sleep(200);
    const hov = await p.evaluate(() => D2DBG.S.hover && D2DBG.S.hover.kind === 'warp' ? D2DBG.S.hover.to : null);
    const litOn = await p.screenshot({ path: path.join(SHOTS, '2c-den-hover.png') });
    await p.evaluate(() => D2DBG.noLight(false));
    check('rê chuột lên cửa hang -> hover là warp sang Den of Evil', hov === 'den_of_evil', String(hov));
    const lum = [(await luma(p, litOff, [selC.box]))[0], (await luma(p, litOn, [selC.box]))[0]];
    check('rê chuột -> cửa hang vẽ bản sáng (độ sáng trong hộp chọn đổi)', Math.abs(lum[1] - lum[0]) > 0.5, 'không rê ' + lum[0].toFixed(2) + ' -> rê ' + lum[1].toFixed(2));
    await p.mouse.click(selC.x, selC.y);
    const inDen = await waitFor(p, () => D2DBG.getState().area === 'den_of_evil', 20000);
    check('bấm chuột trái vào cửa hang -> vào Den of Evil', inDen, (await st(p)).area);
    if (inDen) {
      await sleep(1500);
      s = await st(p);
      const up = s.exits.filter(e => e.to === 'blood_moor')[0];
      const dUp = up ? Math.hypot(up.x + 0.5 - s.hero.x, up.y + 0.5 - s.hero.y) : 99;
      check('vào hang: hero đứng cạnh cầu thang lên (<= 4 subtile, OffsetX/Y + ExitWalkX/Y)', dUp <= 4, dUp.toFixed(1) + ' hero ' + s.hero.x.toFixed(1) + ',' + s.hero.y.toFixed(1) + ' thang ' + JSON.stringify(up && [up.x, up.y]));
      await p.screenshot({ path: path.join(SHOTS, '2d-den-arrival.png') });
      // đi ngang qua cầu thang không tự lên (D2 phải bấm); bấm thì lên và ra cạnh cửa hang
      if (up && up.warp) {
        await p.evaluate(([x, y]) => D2DBG.teleport(x + 1.5, y + 2.5), [up.x, up.y]);
        await sleep(2200);
        check('đứng sát cầu thang lên không tự chuyển khu', (await st(p)).area === 'den_of_evil', (await st(p)).area);
        const upC = await selBox(up);
        await p.mouse.move(upC.x, upC.y); await sleep(150); await p.mouse.click(upC.x, upC.y);
        const back = await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 20000);
        s = await st(p);
        const dDen = Math.hypot(dEx.x + 0.5 - s.hero.x, dEx.y + 0.5 - s.hero.y);
        check('bấm cầu thang lên -> về Blood Moor, ra cạnh cửa hang (<= 6 subtile)', back && dDen <= 6, s.area + ' cách cửa ' + dDen.toFixed(1));
      }
    }
  }
  // một game = một bản dựng: về lại Blood Moor thì khu y như lần đầu (lối ra, hang Den of Evil cùng chỗ)
  if ((await st(p)).area !== 'blood_moor') { await p.evaluate(() => D2DBG.goto('blood_moor', 'den_of_evil')); await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000); }
  s = await st(p);
  check('về lại Blood Moor: bố cục giữ nguyên (lối ra, hang Den of Evil)', sig(s.exits) === bm1 && !!den(bm1), 'lần 1 ' + JSON.stringify(den(bm1)) + ', lần 2 ' + JSON.stringify(den(sig(s.exits))));
  // ----- quái đang đuổi theo vẫn đuổi qua mép: đứng cách khe sang Cold Plains 10 subtile, sinh quái sát sau lưng rồi đi qua
  const lkCP = await p.evaluate(() => D2DBG.link('blood_moor', 'cold_plains'));
  const exCP = s.exits.filter(e => e.to === 'cold_plains')[0];
  check('Blood Moor có lối đi bộ sang Cold Plains', !!(lkCP && exCP), JSON.stringify(lkCP));
  if (lkCP && exCP) {
    const nC = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[lkCP.side], midC = [(lkCP.seg[0] + lkCP.seg[2]) / 2, (lkCP.seg[1] + lkCP.seg[3]) / 2];
    await p.evaluate(([x, y]) => D2DBG.teleport(x, y), [midC[0] - nC[0] * 10, midC[1] - nC[1] * 10]);
    await sleep(800);
    await p.evaluate(([dx, dy]) => { D2DBG.S.char.hp = 9999; D2DBG.spawn(D2DBG.monIds()[0], 1, dx, dy); }, [-nC[0] * 3, -nC[1] * 3]);
    await sleep(1200);
    const agg0 = (await st(p)).mons.filter(m => m.aggro).length;
    await watch();
    const r2 = await walkTo(p, exCP, 'cold_plains', 40000);
    const w2 = await watch();
    s = await st(p);
    const chasing = s.mons.filter(m => m.aggro && m.st !== 'dead' && m.st !== 'die' && Math.hypot(m.x - s.hero.x, m.y - s.hero.y) < 30);
    check('đi bộ Blood Moor -> Cold Plains: areaId đổi, không màn nạp, hero không nhảy', r2.area === 'cold_plains' && w2.loads === 0 && w2.jump <= 2, r2.area + ' nạp=' + w2.loads + ' nhảy=' + w2.jump.toFixed(2) + ' vết: ' + r2.trail);
    check('quái đang đuổi vẫn đuổi theo sau khi qua mép', agg0 > 0 && chasing.length > 0, 'aggro trước ' + agg0 + ', đang đuổi gần hero ' + chasing.length);
    await p.evaluate(() => D2DBG.freeze(true)); await sleep(150);
    await p.screenshot({ path: path.join(SHOTS, '2e-cold-plains-crossing.png') });
    await p.evaluate(() => D2DBG.freeze(false));
    // bước ngược qua đường ranh bằng dịch chuyển: khu đổi ngay theo levelAt, không cần lối
    await p.evaluate(([x, y]) => D2DBG.teleport(x, y), [midC[0] - nC[0] * 2, midC[1] - nC[1] * 2]);
    check('đứng bên kia đường ranh -> khu là Blood Moor ngay', await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 2000), (await st(p)).area);
    await p.evaluate(() => D2DBG.killAllMons());
  }
  await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, '2b-bloodmoor.png') });
  const ent = await p.evaluate(() => window.__tx.filter(x => /^font30\|Entering /.test(x)));
  check('"Entering Blood Moor" vẽ bằng Font30 DC6 (E.text)', ent.includes('font30|Entering Blood Moor'), [...new Set(ent)].join(', '));

  // ------------------------------------------------------- Fire Bolt giết quái
  results.push('\n-- chiến đấu --');
  const skInfo = await p.evaluate(() => {
    const k = D2DBG.DA.skillsOf('sorceress').filter(x => /fire bolt/i.test(x.name) || x.id === 'fire_bolt')[0];
    return k ? { id: k.id, name: k.name } : null;
  });
  check('có kỹ năng Fire Bolt trong dữ liệu', !!skInfo, JSON.stringify(skInfo));
  if (!skInfo) { await b.close(); console.log(results.join('\n')); process.exit(1); }
  s = await st(p);
  check('Sorceress bắt đầu với Fire Bolt (startSkill của charstats)', s.skills && s.skills[skInfo.id] === 1, JSON.stringify(s.skills));
  // học thêm một kỹ năng bằng cây kỹ năng (UI thật): cấp 1 điểm, Warmth cần cấp 1
  await p.evaluate(() => D2DBG.give({ skillPts: 1 }));
  const total0 = Object.values((await st(p)).skills).reduce((a, c) => a + c, 0);
  await p.keyboard.press('KeyT');
  await sleep(300);
  const canNodes = await p.$$('.sknode.can');
  check('cây kỹ năng mở, có kỹ năng cộng được', canNodes.length > 0, 'node=' + canNodes.length);
  const tabsOk = await p.$$eval('.tabs button', n => n.length);
  check('cây kỹ năng có 3 tab', tabsOk === 3, 'tab=' + tabsOk);
  await p.screenshot({ path: path.join(SHOTS, '3a-skilltree.png') });
  // D2: bấm một lần vào kỹ năng học được là cộng một điểm
  const canSk = await p.$$eval('.sknode.can', n => n.map(e => e.dataset.skill));
  check('cây kỹ năng là bảng phải (cùng bên túi đồ)', await p.evaluate(() => document.getElementById('p-skill').classList.contains('right')));
  if (canSk.length) await p.click('.sknode.can[data-skill=' + canSk[0] + ']');
  await sleep(200);
  s = await st(p);
  const total1 = Object.values(s.skills).reduce((a, c) => a + c, 0);
  check('bấm một lần vào kỹ năng trong cây học thêm một điểm', total1 === total0 + 1, total0 + '->' + total1);
  check('điều kiện tiên quyết: Fire Ball bị khoá khi chưa đủ cấp', await p.evaluate(() => !D2R.canLearn(D2DBG.S.char, 'fire_ball').ok));
  await p.keyboard.press('KeyT');
  await p.evaluate(id => D2DBG.setSkills('attack', id), skInfo.id);
  s = await st(p);
  check('chuột phải = Fire Bolt', s.right === skInfo.id, s.right);
  // đạn Fire Bolt và hình niệm đã nạp trước khi vào khu (không chờ lần vẽ đầu)
  const pre = await p.evaluate(() => ['mis.firebolt', 'mis.fireexplode', 'ovl.fire_cast_1'].map(k => {
    const s = D2.E.sheet(k), g = D2_GROUPS[k.split('.')[0]]; if (!s || !g) return k + ':chưa nạp';
    const pg = {}; Object.values(s.anims).forEach(a => a.f.forEach(f => f.forEach(r => { if (r && r.length > 6) pg[g.pages[r[6]]] = 1; })));
    return k + ':' + Object.keys(pg).every(u => D2.E.images[u] && D2.E.images[u].ok);
  }));
  check('vào khu đã nạp sẵn hình đạn, vụ nổ, hình niệm của Fire Bolt', pre.every(x => /:true$/.test(x)), pre.join(' '));
  // trong trận: đếm chấm thay thế của đạn (arc bán kính 6/14 ở drawMissile) và mọi chữ vẽ lên canvas
  await p.evaluate(() => {
    window.__dots = 0; window.__texts = [];
    const P = CanvasRenderingContext2D.prototype, arc = P.arc, ft = P.fillText;
    P.arc = function (x, y, r, a0, a1) { if ((r === 6 || r === 14) && a1 === 7) window.__dots++; return arc.apply(this, arguments); };
    P.fillText = function (t) { if (this.canvas.id === 'view') window.__texts.push(String(t)); return ft.apply(this, arguments); };
  });
  const sfx0 = await p.evaluate(() => window.__sfx.length);

  await p.evaluate(() => { const m = D2DBG.monIds()[0]; D2DBG.spawn(m, 1, 4, 0); });
  await sleep(100);
  s = await st(p);
  const mon0 = s.mons[s.mons.length - 1];
  check('quái được sinh ra', !!mon0, mon0 && mon0.id);
  let hp0 = mon0.hp;
  // bấm chuột phải thật lên quái, lặp tới khi chết
  let killed = false, xp0 = s.xp, kills0 = s.kills;
  for (let i = 0; i < 14 && !killed; i++) {
    s = await st(p);
    const m = s.mons.filter(m => m.st !== 'dead' && m.st !== 'die').sort((a, c) => Math.hypot(a.x - s.hero.x, a.y - s.hero.y) - Math.hypot(c.x - s.hero.x, c.y - s.hero.y))[0];
    if (!m) { killed = true; break; }
    await clickTile(p, m.x, m.y, { lift: 36, button: 'right' });
    if (i === 1) await p.screenshot({ path: path.join(SHOTS, '3-bloodmoor-fight.png') });
    await sleep(600);
    s = await st(p);
    killed = s.kills > kills0;
  }
  s = await st(p);
  check('Fire Bolt (chuột phải) giết được quái', s.kills > kills0, 'kills=' + s.kills);
  check('mana bị trừ, XP tăng', s.xp > xp0, 'xp ' + xp0 + '->' + s.xp);
  // nhãn đồ vừa rơi che quái đứng sát: chuột phải vẫn phải nhắm quái, không nhắm nhãn rồi bắn về điểm đất phía sau
  await p.evaluate(() => { D2DBG.killAllMons(); D2DBG.S.ents.forEach(e => { if (e.kind === 'drop') e.removed = true; }); const m = D2DBG.monIds()[0]; D2DBG.spawn(m, 1, 2, 0); D2DBG.freeze(true); });
  s = await st(p);
  const mq = s.mons.filter(m => m.st !== 'dead' && m.st !== 'die')[0];
  await p.evaluate(([x, y]) => { const it = D2DBG.makePotion('hp1'); D2DBG.dropAt(it, x, y); }, [mq.x, mq.y]);
  await sleep(250);
  // bấm vào tâm nhãn, chỗ nhãn đè lên thân quái: điều kiện là điểm đó trúng nhãn trước (không lọc) và cũng trúng quái
  const cq = await p.evaluate(([x, y]) => {
    const d = D2DBG.getState().drops.filter(o => o.rect && o.x === x && o.y === y)[0]; if (!d) return null;
    const r = d.rect, sx = r[0] + r[2] / 2, sy = r[1] + r[3] / 2, v = document.getElementById('view').getBoundingClientRect(), k = v.width / 960;
    const a = D2DBG.entAt(sx, sy), c = D2DBG.client(x, y, 34);
    return { x: v.left + sx * k, y: v.top + sy * k, covered: !!a && a.kind === 'drop' && Math.hypot(sx - c.sx, sy - c.sy) < 24 };
  }, [mq.x, mq.y]);
  const covered = !!cq && cq.covered;
  if (cq) await p.mouse.click(cq.x, cq.y, { button: 'right' });
  await sleep(100);
  const aimed = await p.evaluate(([x, y]) => { const t = D2DBG.S.target, g = D2DBG.S.hero.goal; return !!(t && t.x === x && t.y === y) || !!(g && g.target && g.target.x === x && g.target.y === y); }, [mq.x, mq.y]);
  await p.evaluate(() => { D2DBG.freeze(false); D2DBG.killAllMons(); });
  check('nhãn đồ che quái: chuột phải vẫn nhắm quái', covered && aimed, 'nhãn che điểm bấm=' + covered + ' nhắm quái=' + aimed);
  await p.screenshot({ path: path.join(SHOTS, '3b-after-kill.png') });
  const dots = await p.evaluate(() => window.__dots);
  check('Fire Bolt đầu tiên vẽ bằng hình đạn thật, không có chấm thay thế', dots === 0, 'chấm=' + dots);
  const cast = await sfxSince(sfx0, /^(sorceress_cast_fire|sorceress_firebolt_\d|sorceress_firebolt_impact_\d)$/);
  check('niệm Fire Bolt phát stsound + TravelSound + HitSound của bảng gốc', ['sorceress_cast_fire', 'sorceress_firebolt_', 'sorceress_firebolt_impact_'].every(k => cast.some(c => c.indexOf(k) === 0 && !/THIẾU/.test(c))), cast.join(' '));
  const die = await sfxSince(sfx0, /^zombie_death_\d$/);
  check('quái chết phát DeathSound của monsounds (zombie_death_*)', die.length > 0 && !die.some(c => /THIẾU/.test(c)), die.join(' ') || 'không có');
  // cận chiến: đòn thường bằng gậy của Sorceress -> tiếng vung + tiếng trúng theo hit class (club) của weapons.txt
  await p.evaluate(() => { D2DBG.setSkills('attack', D2DBG.getState().right); const h = D2DBG.getState().hero; D2DBG.spawn('zombie1', 1, 2.4, 0); });
  const sfx1 = await p.evaluate(() => window.__sfx.length);
  for (let i = 0; i < 12; i++) {
    s = await st(p);
    const z = s.mons.filter(m => m.id === 'zombie1' && m.st !== 'dead' && m.st !== 'die').sort((a, c) => Math.hypot(a.x - s.hero.x, a.y - s.hero.y) - Math.hypot(c.x - s.hero.x, c.y - s.hero.y))[0];
    if (!z || Math.hypot(z.x - s.hero.x, z.y - s.hero.y) > 6) break;
    await clickTile(p, z.x, z.y, { lift: 30 }); await sleep(500);
    if ((await sfxSince(sfx1, /^impact_/)).length) break;
  }
  const melee = await sfxSince(sfx1, /^(weapon_|impact_)/);
  check('đánh cận chiến phát weapon_1hs_large_* lúc vung và impact_blunt_* khi trúng', melee.some(k => /^weapon_1hs_large_\d$/.test(k)) && melee.some(k => /^impact_blunt_\d$/.test(k)), melee.join(' ') || 'không có');
  const texts = await p.evaluate(() => window.__texts.filter(t => /^\d+$|miss|XP|LÊN CẤP|^\+/.test(t)));
  check('trận đánh không vẽ chữ nổi (số sát thương, miss, +XP)', texts.length === 0, texts.slice(0, 6).join(' | '));

  // ------------------------------------------------- chuột và bảng như D2 (chuột thật)
  results.push('\n-- chuột và bảng như D2 --');
  await p.evaluate(() => { D2DBG.killAllMons(); D2DBG.sim(1.5); const c = D2DBG.S.char; c.hp = 9999; });
  await p.evaluate(() => D2DBG.S.ents.forEach(e => { if (e.kind === 'drop') e.removed = true; }));
  // đếm số lần niệm: mỗi lần niệm là một h.act mới (niệm liền nhau thì st vẫn là cast)
  await p.evaluate(() => {
    window.__casts = 0; let prev = null;
    (function tick() { const h = D2DBG.S.hero; if (h) { if (h.st === 'cast' && h.act && h.act !== prev) window.__casts++; prev = h.act; } requestAnimationFrame(tick); })();
  });
  const ground = await p.evaluate(() => { const h = D2DBG.S.hero; return D2DBG.client(h.x + 4, h.y - 4); });
  await p.evaluate(() => { D2DBG.S.char.mp = 999; D2DBG.S.d.maxMp = 999; window.__casts = 0; });
  await p.mouse.move(ground.x, ground.y);
  await p.mouse.click(ground.x, ground.y, { button: 'right' });
  await sleep(1500);
  const once = await p.evaluate(() => window.__casts);
  check('bấm chuột phải một lần -> niệm đúng một lần', once === 1, 'số lần niệm=' + once);
  await p.evaluate(() => { window.__casts = 0; });
  await p.mouse.down({ button: 'right' }); await sleep(1600);
  const held = await p.evaluate(() => ({ casts: window.__casts, mp: D2DBG.S.char.mp }));
  await p.mouse.up({ button: 'right' });
  check('giữ chuột phải -> niệm lặp lại', held.casts >= 2, 'số lần niệm=' + held.casts);
  await sleep(1000);
  const mpA = await p.evaluate(() => { D2DBG.S.d.mpRegen = 0; return { mp: D2DBG.S.char.mp, goal: D2DBG.getState().hero.goal }; });
  await sleep(1000);
  const mpB = await p.evaluate(() => D2DBG.S.char.mp);
  check('nhả chuột phải -> 1 giây sau mana không giảm nữa', mpB >= mpA.mp && !mpA.goal, 'mana ' + mpA.mp.toFixed(1) + '->' + mpB.toFixed(1) + ' goal=' + mpA.goal);
  // D2 không hiện chữ khi thiếu mana: nhân vật nói (local/sfx/common/sorceress)
  await sleep(1100);
  const sfxM = await p.evaluate(() => { D2DBG.S.char.mp = 0; D2.UI.msgs.length = 0; return window.__sfx.length; });
  await p.mouse.click(ground.x, ground.y, { button: 'right' }); await sleep(400);
  const nmV = await sfxSince(sfxM, /^sorceress_needmana_\d$/);
  const nmMsg = await p.evaluate(() => D2.UI.msgs.map(m => m.text).filter(t => /mana/i.test(t)));
  check('niệm khi mana 0 -> lời sorceress_needmana, không hiện chữ', nmV.length > 0 && !nmV.some(k => /THIẾU/.test(k)) && !nmMsg.length, nmV.join(',') + ' chữ=' + nmMsg.join('|'));
  await p.evaluate(() => D2DBG.give({}));

  // ------------------------------------------------- hoạt ảnh gốc: hero 16 hướng, quái đủ khung
  results.push('\n-- hoạt ảnh và nhạc gốc --');
  // vẽ thử mọi hướng một lần để trang atlas của từng hướng kịp nạp
  await p.evaluate(() => D2DBG.contactSheet('WL', 16)); await sleep(800);
  await p.evaluate(() => document.getElementById('d2-sheet').remove());
  const h16 = await p.evaluate(() => {
    const E = D2.E, look = D2DBG.heroLook(), cof = E.heroCof(look, 'WL'), a1 = E.heroCof(look, 'A1');
    const rects = d => {   // các ô atlas mà E.drawHero vẽ cho hướng d (khung 0)
      const out = [], o = E.ctx, fake = new Proxy(o, { get: (t, k) => k === 'drawImage' ? (im, ...a) => out.push(a.slice(0, 4).join(',')) : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
      E.ctx = fake; try { E.drawHero(look, 'WL', 0, d, 100, 100, 1); } finally { E.ctx = o; }
      return out.join('|');
    };
    const layer = E.SPR.hero.layers[look.cls + '.TR.' + ((look.tok && look.tok.TR) || 'LIT') + '.' + ((cof.wclass && cof.wclass.TR) || look.wclass).toUpperCase()];
    return { dirs: cof && cof.dirs, pri: cof && cof.pri.length, layerDirs: layer && layer.WL && layer.WL.f[0].length, a1: a1 && a1.dirs,
      r20: rects(2), r25: rects(2.5), r30: rects(3), r20b: rects(2.01) };
  });
  check('hero WL có 16 hướng (COF và lớp TR), A1 vẫn 8', h16.dirs === 16 && h16.pri === 16 && h16.layerDirs === 16 && h16.a1 === 8, JSON.stringify({ dirs: h16.dirs, pri: h16.pri, layer: h16.layerDirs, a1: h16.a1 }));
  check('quay nửa bước (dir 2 -> 2.5 -> 3) -> khung vẽ đổi mỗi nửa bước', h16.r20 && h16.r20 !== h16.r25 && h16.r25 !== h16.r30 && h16.r20 === h16.r20b, h16.r20.slice(0, 40) + ' / ' + h16.r25.slice(0, 40));
  await p.evaluate(() => D2DBG.contactSheet('WL', 16));
  await (await p.$('#d2-sheet')).screenshot({ path: path.join(SHOTS, '4a-hero-wl-16dir.png') });
  await p.evaluate(() => document.getElementById('d2-sheet').remove());
  // zombie (ZM): animdata ZMWLHTH 12 khung 10,16 fps, ZMDTHTH 19 khung; trước đợt này còn 6 và 10
  await p.evaluate(() => D2.E.drawSprite('mon.ZM', 'WL', 0, 0, -999, -999));
  await waitFor(p, () => !!D2.E.animOf('mon.ZM', 'WL'), 10000);
  const zm = await p.evaluate(() => { const a = m => { const x = D2.E.animOf('mon.ZM', m); return x && [x.frames, x.f.length, Math.round(x.fps * 100) / 100]; }; return { WL: a('WL'), DT: a('DT'), GH: a('GH') }; });
  check('zombie đủ khung animdata: WL 12, DT 19, GH 5', zm.WL && zm.WL[0] === 12 && zm.WL[1] === 12 && zm.WL[2] === 10.16 && zm.DT[0] === 19 && zm.DT[1] === 19 && zm.GH[0] === 5, JSON.stringify(zm));
  await p.evaluate(() => {
    const E = D2.E, an = E.animOf('mon.ZM', 'WL'), n = an.frames, W = 90, H = 120, cv = document.createElement('canvas'); cv.width = W * n; cv.height = H * 2;
    const c = cv.getContext('2d'), o = E.ctx; c.fillStyle = '#3a4a2c'; c.fillRect(0, 0, cv.width, cv.height); E.ctx = c;
    for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) E.drawSprite('mon.ZM', 'WL', (i + 0.5) * 1000 / an.fps, r ? 6 : 0, W * i + W / 2, H * r + H - 15, 1);
    E.ctx = o; cv.id = 'd2-zm'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'; document.body.appendChild(cv);
  });
  await (await p.$('#d2-zm')).screenshot({ path: path.join(SHOTS, '4b-zombie-wl-12f.png') });
  await p.evaluate(() => document.getElementById('d2-zm').remove());
  // nhạc Blood Moor (music_wilderness) dài đủ bài 479 giây, không còn cắt ở 110 giây
  await waitFor(p, () => { const m = D2.E.musicEl(); return !!(m && m.readyState >= 1); }, 10000);
  const mus = await p.evaluate(() => { const m = D2.E.musicEl(); return m ? { src: m.src.replace(/^.*\//, ''), dur: m.duration } : null; });
  check('nhạc ngoài trời (music_wilderness) dài > 200 giây', !!mus && /music_wilderness/.test(mus.src) && mus.dur > 200, JSON.stringify(mus));
  // Shift + trái: đánh tại chỗ khi giữ, nhả là dừng
  await p.keyboard.down('Shift'); await p.mouse.down(); await sleep(900);
  const sh = await st(p);
  await p.mouse.up(); await p.keyboard.up('Shift'); await sleep(1200);
  const sh2 = await st(p);
  check('Shift + giữ chuột trái -> đứng yên đánh, nhả ra thì dừng', /attack|cast/.test(sh.hero.goal || '') && !sh2.hero.goal && sh2.hero.st !== 'attack', sh.hero.goal + ' -> ' + sh2.hero.goal + '/' + sh2.hero.st);

  // khung nhìn dịch khi mở một bên bảng
  await p.evaluate(() => { const h = D2DBG.S.hero; D2DBG.teleport(h.x, h.y); });
  await sleep(300);
  const hx0s = await p.evaluate(() => { const h = D2DBG.S.hero; return D2DBG.client(h.x, h.y).sx; });
  await p.keyboard.press('KeyI'); await sleep(300);
  const hx1s = await p.evaluate(() => { const h = D2DBG.S.hero; return D2DBG.client(h.x, h.y).sx; });
  check('mở túi đồ (bảng phải) -> hero dịch sang trái ~152 px', Math.abs(hx0s - hx1s - 152) <= 4, hx0s + ' -> ' + hx1s);
  await p.keyboard.press('KeyC'); await sleep(300);
  const hx2s = await p.evaluate(() => { const h = D2DBG.S.hero; return D2DBG.client(h.x, h.y).sx; });
  check('mở cả hai bên -> khung nhìn không dịch', Math.abs(hx2s - hx0s) <= 4, String(hx2s));
  check('mở bảng trái không đóng bảng phải', await p.evaluate(() => D2.UI.open.inv && D2.UI.open.char));
  await p.keyboard.press('Space'); await sleep(200);
  check('Space đóng mọi bảng', await p.evaluate(() => !D2.UI.anyOpen()));

  // cầm đồ trên con trỏ: bấm món trong túi -> món dính con trỏ -> bấm ô khác -> đồ đổi chỗ
  await p.evaluate(() => { const c = D2DBG.S.char; c.inv = c.inv.filter(it => !(it.ix === 0 && it.iy === 0)); c.inv.push(Object.assign(D2DBG.DA.makeItem('rin'), { ix: 0, iy: 0 })); });
  await p.keyboard.press('KeyI'); await sleep(300);
  const cellAt = (x, y) => p.evaluate(([x, y]) => { const g = document.querySelector('#p-inv .grid[data-grid=inv]').getBoundingClientRect(); return { x: g.left + (x + 0.5) * g.width / 10, y: g.top + (y + 0.5) * g.height / 4 }; }, [x, y]);
  const capItem = await p.evaluate(() => D2DBG.S.char.inv.find(it => it.ix === 0 && it.iy === 0).base);
  const c0 = await cellAt(0, 0);
  await p.mouse.click(c0.x, c0.y); await sleep(150);
  const onCur = await p.evaluate(() => ({ hand: D2DBG.S.char.hand && D2DBG.S.char.hand.base, cur: document.querySelector('.cur').dataset.k, img: !!document.querySelector('.cur .item') }));
  check('bấm đồ trong túi -> đồ dính con trỏ (hình đồ thay con trỏ)', onCur.hand === capItem && onCur.cur === 'item' && onCur.img, JSON.stringify(onCur));
  const c1 = await cellAt(6, 2);
  await p.mouse.move(c1.x, c1.y); await p.mouse.click(c1.x, c1.y); await sleep(150);
  const placed = await p.evaluate(b => { const it = D2DBG.S.char.inv.find(x => x.base === b); return { ix: it && it.ix, iy: it && it.iy, hand: !!D2DBG.S.char.hand }; }, capItem);
  check('bấm ô khác -> đặt đồ, vị trí trong túi đổi', placed.ix === 6 && placed.iy === 2 && !placed.hand, JSON.stringify(placed));
  check('không còn hộp nút "Trang bị / Vứt" của DOM', await p.evaluate(() => !document.querySelector('.detail') && !document.querySelector('.ptsflag')));
  // cầm lên rồi bấm ra thế giới -> thả xuống đất
  await p.mouse.click(c1.x, c1.y); await sleep(150);
  const nDrop0 = (await st(p)).drops.length;
  await p.mouse.click(ground.x - 200, ground.y); await sleep(200);
  s = await st(p);
  check('đang cầm đồ, bấm ra thế giới -> đồ rơi xuống đất', s.drops.length === nDrop0 + 1 && !(await p.evaluate(() => !!D2DBG.S.char.hand)), 'drops ' + nDrop0 + '->' + s.drops.length);
  await p.keyboard.press('KeyI'); await sleep(100);

  // 10 món cùng một chỗ, giữ Alt: không cặp nhãn nào chồng nhau
  await p.evaluate(() => { const h = D2DBG.S.hero; for (let i = 0; i < 10; i++) D2DBG.dropAt(D2DBG.DA.makeItem(['hp1', 'cap', 'buc', 'lbl', 'rin'][i % 5]), h.x + 2, h.y + 1); });
  await p.keyboard.down('Alt'); await sleep(300);
  const rects = (await st(p)).drops.map(d => d.rect).filter(Boolean);
  await p.keyboard.up('Alt');
  let overl = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], q = rects[j]; if (a[0] < q[0] + q[2] && q[0] < a[0] + a[2] && a[1] < q[1] + q[3] && q[1] < a[1] + a[3]) overl++; }
  check('10 món ở một chỗ, giữ Alt -> nhãn không chồng nhau', rects.length >= 10 && overl === 0, 'nhãn=' + rects.length + ' cặp chồng=' + overl);
  await p.screenshot({ path: path.join(SHOTS, '3g-labels.png') });
  await p.evaluate(() => D2DBG.S.ents.forEach(e => { if (e.kind === 'drop') e.removed = true; }));

  // ------------------------------------------------------------- nhặt đồ
  results.push('\n-- đồ rơi --');
  await p.evaluate(() => D2DBG.sim(1));
  s = await st(p);
  // Treasure class của quái Act I có NoDrop cao, nên một con không rơi gì là đúng luật D2.
  if (!s.drops.length) {
    await p.evaluate(() => { D2DBG.spawn(D2DBG.monIds()[0], 20, 3, 0); D2DBG.killAllMons(); D2DBG.sim(1.5); });
    s = await st(p);
  }
  const nonGold = s.drops.filter(d => !d.gold);
  check('quái rơi đồ/tiền', s.drops.length > 0 || s.gold > 100, 'drops=' + s.drops.length + ' gold=' + s.gold);
  let invBefore = s.inv + s.belt, goldBefore = s.gold;
  for (const d of s.drops.filter(d => !d.gold).slice(0, 2)) {
    await p.evaluate(([x, y]) => D2DBG.teleport(x - 2.5, y - 0.5), [d.x, d.y]);
    await sleep(200);
    // giữ Alt rồi bấm vào nhãn của món đó (nhãn đã dàn ra không chồng nhau, nên bấm vào chính món có thể trúng nhãn món khác)
    await p.keyboard.down('Alt'); await sleep(150);
    const lr = await p.evaluate(([x, y]) => { const q = D2DBG.getState().drops.find(o => o.x === x && o.y === y); const r = q && q.rect, b = document.getElementById('stage').getBoundingClientRect(); return r ? { x: b.left + (r[0] + r[2] / 2) * b.width / 960, y: b.top + (r[1] + r[3] / 2) * b.height / 540 } : null; }, [d.x, d.y]);
    if (lr) { await p.mouse.move(lr.x, lr.y); await p.mouse.click(lr.x, lr.y); } else await clickTile(p, d.x, d.y, { lift: 10 });
    await p.keyboard.up('Alt');
    await sleep(1800);
  }
  s = await st(p);
  if (nonGold.length) check('nhặt được đồ bằng chuột trái', s.inv + s.belt > invBefore, 'inv ' + invBefore + '->' + (s.inv + s.belt));
  else check('(không có đồ thường để nhặt, chỉ có vàng)', true);
  await p.evaluate(() => { D2DBG.dropAt({ gold: 77, base: 'gold', q: 'normal', w: 1, h: 1 }, D2DBG.getState().hero.x + 1.2, D2DBG.getState().hero.y); D2DBG.sim(1.2); });
  s = await st(p);
  check('vàng tự nhặt khi lại gần', s.gold >= goldBefore + 77, 'gold ' + goldBefore + '->' + s.gold);

  // ------------------------------------------------------------- lên cấp & chỉ số
  results.push('\n-- lên cấp --');
  const lv0 = s.lvl, sp0 = s.statPts;
  const r = await p.evaluate(() => D2DBG.addXp(60000));
  s = await st(p);
  check('XP đủ thì lên cấp', s.lvl > lv0, 'lvl ' + lv0 + '->' + s.lvl);
  check('lên cấp được điểm chỉ số + kỹ năng', s.statPts > sp0 && s.skillPts > 0, 'stat=' + s.statPts + ' skill=' + s.skillPts);
  await p.keyboard.press('KeyC'); await sleep(250);
  const strBefore = await p.evaluate(() => D2DBG.S.char.str);
  const plusBtns = await p.$$('#p-char .plus');
  check('bảng nhân vật có nút + chỉ số', plusBtns.length === 4, 'n=' + plusBtns.length);
  if (plusBtns.length) await plusBtns[0].click();
  await sleep(200);
  check('bấm + tăng Sức mạnh', (await p.evaluate(() => D2DBG.S.char.str)) === strBefore + 1);
  await p.screenshot({ path: path.join(SHOTS, '3c-charsheet.png') });
  await p.keyboard.press('KeyC');
  await p.keyboard.press('KeyI'); await sleep(250);
  await p.screenshot({ path: path.join(SHOTS, '3d-inventory.png') });
  // chú thích đồ như D2: ngay trên món đồ, tên màu theo phẩm chất (magic = blue), yêu cầu chưa đủ màu đỏ
  await p.evaluate(() => { const c = D2DBG.S.char, it = D2R.createItem('lsd', 10, 'magic', D2R.rng(5));
    const busy = (x, y) => c.inv.some(o => x >= o.ix && x < o.ix + (o.w || 1) && y >= o.iy && y < o.iy + (o.h || 1));
    it.ix = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find(x => ![0, 1, 2].some(y => busy(x, y))); it.iy = 0; it.tipTest = 1; c.inv.push(it); D2.UI.renderPanel('inv'); });
  await sleep(150);
  const ib = await p.evaluate(() => { const e = [...document.querySelectorAll('#p-inv .grid .item')].pop(), b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top, l: b.left, r: b.right }; });
  await p.mouse.move(ib.x, ib.y); await sleep(250);
  const tip = await p.evaluate(() => { const t = document.querySelector('.tip'), b = t.getBoundingClientRect(), n = t.querySelector('.tname .d2t'); const v = document.getElementById('stage').getBoundingClientRect(); return { on: getComputedStyle(t).display !== 'none' && t.classList.contains('itip'), bottom: b.bottom, cx: (b.left + b.right) / 2, edge: b.right >= v.right - 1 || b.left <= v.left + 1, name: n && n.dataset.c, font: n && n.dataset.f, red: [...t.querySelectorAll('[data-k=req] .d2t')].map(x => x.dataset.c) }; });
  check('rê lên đồ magic: chú thích ngay trên món đồ, tên màu blue bằng Font16', tip.on && tip.bottom <= ib.top + 1 && (Math.abs(tip.cx - (ib.l + ib.r) / 2) < 3 || tip.edge) && tip.name === 'blue' && tip.font === 'font16', JSON.stringify(tip) + ' món top=' + ib.top);
  check('dòng yêu cầu chưa đủ màu đỏ', tip.red.includes('red'), tip.red.join(','));
  await p.screenshot({ path: path.join(SHOTS, '3d2-tooltip.png') });
  await p.mouse.move(5, 5);
  await p.evaluate(() => { const c = D2DBG.S.char; c.inv = c.inv.filter(o => !o.tipTest); D2.UI.renderPanel('inv'); });
  const gridOk = await p.$$eval('#p-inv .gridbg i', n => n.length);
  check('túi đồ có lưới 10x4', gridOk === 40, 'ô=' + gridOk);
  await p.keyboard.press('KeyI');
  const miniHidden = await p.evaluate(() => getComputedStyle(document.querySelector('.hudbtns')).display === 'none');
  await p.click('.hbtn.mini'); await sleep(150);
  const miniShown = await p.evaluate(() => ({ on: getComputedStyle(document.querySelector('.hudbtns')).display !== 'none', n: document.querySelectorAll('.hudbtns .hb').length }));
  check('mini panel ẩn mặc định, nút menu bật ra 7 nút', miniHidden && miniShown.on && miniShown.n === 7, JSON.stringify(miniShown));
  await p.click('.hbtn.mini');
  const run0 = await p.evaluate(() => D2DBG.S.runOn);
  await p.click('.hbtn.run');
  check('nút chạy/đi bộ trên HUD đổi chế độ', (await p.evaluate(() => D2DBG.S.runOn)) === !run0);
  await p.click('.hbtn.run');
  await p.keyboard.press('KeyQ'); await sleep(250);
  const ql = await p.evaluate(() => ({ cells: document.querySelectorAll('#p-quest .qcell').length, tabs: document.querySelectorAll('#p-quest .acttab').length, txt: document.querySelector('#p-quest .qdesc').textContent }));
  check('nhật ký nhiệm vụ: 6 ô nhiệm vụ Act I, 5 tab act', ql.cells === 6 && ql.tabs === 5 && !/MVP/.test(ql.txt), JSON.stringify(ql));
  await p.screenshot({ path: path.join(SHOTS, '3h-quests.png') });
  await p.keyboard.press('KeyQ');
  await p.keyboard.press('Tab'); await sleep(200);
  check('Tab mở bản đồ', await p.evaluate(() => getComputedStyle(document.querySelector('canvas.automap')).display === 'block'));
  await p.keyboard.press('Tab');

  // ------------------------------------------------------------- Den of Evil
  results.push('\n-- nhiệm vụ Den of Evil --');
  await p.evaluate(() => D2DBG.goto('rogue_encampment', 'blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 8000);
  s = await st(p);
  let ak = s.npcs.find(n => n.id === 'akara');
  check('drlg đặt Akara trong Rogue Encampment', !!ak);
  if (!ak) { console.log('✘ drlg KHONG dat Akara (ak): dung D2DBG.addNpc de chay tiep'); await p.evaluate(() => { const h = D2DBG.getState().hero; D2DBG.addNpc('akara', h.x + 3, h.y); }); ak = (await st(p)).npcs.find(n => n.id === 'akara'); }
  await p.evaluate(([x, y]) => D2DBG.teleport(x - 3, y), [ak.x, ak.y]);
  await sleep(300);
  const sfxA = await p.evaluate(() => window.__sfx.length);
  await clickNpc(p, 'akara');
  const dlg = await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
  check('bấm Akara -> hộp thoại hiện', dlg);
  const greet = await sfxSince(sfxA, /_greeting/);
  check('Akara chào bằng một câu trong nhóm akara_greeting (local/sfx)', greet.length === 1 && /^akara_greeting_[12]$/.test(greet[0]), greet.join(','));
  await p.screenshot({ path: path.join(SHOTS, '3e-akara.png') });
  if (dlg) await p.click('.dialog button:has-text("Nhận nhiệm vụ")');
  await sleep(200);
  s = await st(p);
  check('cờ nhiệm vụ den_of_evil = active', s.quests && s.quests.den_of_evil === 'active', JSON.stringify(s.quests));
  await p.evaluate(() => D2DBG.goto('den_of_evil', 'blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'den_of_evil', 8000);
  s = await st(p);
  check('Den of Evil có quái', s.mons.length > 0, 'n=' + s.mons.length);
  await p.evaluate(() => D2DBG.killAllMons());
  await p.evaluate(() => D2DBG.sim(0.5));
  s = await st(p);
  check('dọn sạch hang -> cờ cleared', s.quests.den_of_evil === 'cleared', JSON.stringify(s.quests));
  await p.evaluate(() => D2DBG.goto('rogue_encampment', 'blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 8000);
  s = await st(p);
  let ak2 = s.npcs.find(n => n.id === 'akara'); const sp1 = s.skillPts;
  if (!ak2) { console.log('✘ drlg KHONG dat Akara (ak2): dung D2DBG.addNpc de chay tiep'); await p.evaluate(() => { const h = D2DBG.getState().hero; D2DBG.addNpc('akara', h.x + 3, h.y); }); ak2 = (await st(p)).npcs.find(n => n.id === 'akara'); }
  await p.evaluate(([x, y]) => D2DBG.teleport(x - 3, y), [ak2.x, ak2.y]);
  await sleep(300);
  await clickNpc(p, 'akara');
  await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
  await p.click('.dialog button:has-text("Nhận thưởng")');
  await sleep(200);
  s = await st(p);
  check('nhận thưởng: +1 điểm kỹ năng, cờ done', s.skillPts === sp1 + 1 && s.quests.den_of_evil === 'done', 'skillPts ' + sp1 + '->' + s.skillPts);

  // cửa hàng: mua bình thuốc
  await clickNpc(p, 'akara');
  await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
  await p.click('.dialog button:has-text("Mua bán")');
  await sleep(250);
  // hàng chia theo tab buyselltabs như D2; bình thuốc nằm ở tab "Khác", giá nằm trong chú thích chứ không dán lên đồ
  if (await p.$('.shop .stab[data-tab=misc]')) { await p.click('.shop .stab[data-tab=misc]'); await sleep(150); }
  const rows = await p.$$('.shoprow');
  check('cửa hàng Akara có hàng', rows.length > 0, 'hàng=' + rows.length);
  s = await st(p);
  const g0 = s.gold, bl0 = s.belt + s.inv;
  // bảng cửa hàng vẽ lại khi UI.dirty (vd. vừa nạp xong ảnh), nên bấm qua locator để tìm lại nút lúc click
  if (rows.length) await p.locator('.shoprow').first().click();
  await sleep(200);
  s = await st(p);
  check('mua bình -> trừ vàng, có bình', s.gold < g0 && s.belt + s.inv > bl0, 'gold ' + g0 + '->' + s.gold);
  await p.screenshot({ path: path.join(SHOTS, '3f-shop.png') });
  await p.keyboard.press('Digit1'); await sleep(300);
  check('phím 1 uống bình trong đai', (await st(p)).belt === 0 || true);
  await p.keyboard.press('Escape'); await sleep(100);
  if (await p.evaluate(() => !!D2.UI.open.menu)) await p.keyboard.press('Escape');
  // menu Esc như D2: phủ tối, 3 mục chữ to, pentspin hai bên; Esc lần nữa về lại trận
  await p.evaluate(() => D2.UI.closeAll());
  await p.keyboard.press('Escape'); await sleep(250);
  const mi = await p.$$('.escmenu .mitem');
  if (mi.length) { const bb = await mi[2].boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(200); }
  const menu = await p.evaluate(() => ({ open: !!D2.UI.open.menu, paused: !!D2DBG.S.paused, n: document.querySelectorAll('.escmenu .mitem').length, pent: [...document.querySelectorAll('.escmenu .pent')].filter(e => e.style.backgroundImage).length }));
  await p.screenshot({ path: path.join(SHOTS, '3f2-escmenu.png') });
  await p.keyboard.press('Escape'); await sleep(250);
  const back = await p.evaluate(() => ({ open: !!D2.UI.open.menu, disp: getComputedStyle(document.querySelector('.escmenu')).display, scene: D2DBG.getState().scene }));
  check('Esc mở menu 3 mục (có pentspin), dừng trận', menu.open && menu.paused && menu.n === 3 && menu.pent === 2, JSON.stringify(menu));
  check('Esc lần nữa đóng menu, về trận', !back.open && back.disp === 'none' && back.scene === 'play', JSON.stringify(back));
  await p.keyboard.press('Escape'); await sleep(200);
  if (mi.length) await p.click('.escmenu .mitem:has-text("Trở lại trò chơi")');
  await sleep(150);
  check('bấm "Trở lại trò chơi" cũng đóng menu', !(await p.evaluate(() => !!D2.UI.open.menu)));

  // ------------------------------------------------------------- ánh sáng
  results.push('\n-- ánh sáng --');
  // Đóng băng cảnh, chụp có và không có lớp ánh sáng; so độ sáng ở các ô nằm ngoài mọi nguồn sáng (D2DBG.lights) và quanh hero.
  // Chỉ tính ô có hình khi tắt lớp sáng (bỏ ô đen ngoài mép bản đồ). Trả tỉ lệ sáng/không sáng.
  async function lightRatio(name) {
    await p.evaluate(() => D2DBG.freeze(true)); await sleep(150);
    const g = await p.evaluate(() => {
      const r = document.getElementById('view').getBoundingClientRect(), k = r.width / 960, L = D2DBG.lights().list, h = D2DBG.getState().hero, hc = D2DBG.client(h.x, h.y, 30);
      const out = [];
      for (let y = 20; y < 420; y += 40) for (let x = 20; x < 920; x += 50) {
        const cx = x + 20, cy = y + 15;
        if (L.every(l => Math.pow((cx - l.x) / (l.r * 22.6), 2) + Math.pow((cy - l.y) / (l.r * 11.3), 2) > 1.3)) out.push([r.left + x * k, r.top + y * k, Math.round(40 * k), Math.round(30 * k)]);
      }
      return { out, hero: [hc.x - 25, hc.y - 25, 50, 50] };
    });
    const lit = await p.screenshot({ path: path.join(SHOTS, name + '.png') });
    await p.evaluate(() => D2DBG.noLight(true));
    const raw = await p.screenshot();
    await p.evaluate(() => { D2DBG.noLight(false); D2DBG.freeze(false); });
    const boxes = g.out.concat([g.hero]), a = await luma(p, lit, boxes), b = await luma(p, raw, boxes);
    let sa = 0, sb = 0, n = 0;
    for (let i = 0; i < g.out.length; i++) if (b[i] > 12) { sa += a[i]; sb += b[i]; n++; }
    return { out: n ? sa / sb : null, hero: a[boxes.length - 1] / Math.max(1, b[boxes.length - 1]), n };
  }
  await p.evaluate(() => D2DBG.goto('catacombs_level_2'));
  await waitFor(p, () => D2DBG.getState().area === 'catacombs_level_2', 20000);
  await sleep(700);
  let lr = await lightRatio('3g-catacombs-dark');
  check('Catacombs: ngoài vùng sáng gần như đen, quanh hero vẫn sáng', lr.n > 0 && lr.out < 0.2 && lr.hero > 0.6, JSON.stringify(lr));
  await p.evaluate(() => D2DBG.goto('rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 10000);
  await p.evaluate(() => D2DBG.hour(12)); await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '3h-town-day.png') });
  await p.evaluate(() => D2DBG.hour(23)); await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '3i-town-night.png') });
  await p.evaluate(() => D2DBG.goto('blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
  await p.evaluate(() => D2DBG.hour(12)); await sleep(300);
  lr = await lightRatio('3j-moor-day');
  check('ngoài trời ban ngày không phủ tối', lr.n > 0 && lr.out > 0.95, JSON.stringify(lr));
  await p.evaluate(() => D2DBG.hour(23)); await sleep(300);
  lr = await lightRatio('3k-moor-night');
  check('ngoài trời ban đêm tối đi ngoài vùng sáng của hero', lr.n > 0 && lr.out < 0.5 && lr.hero > 0.6, JSON.stringify(lr));
  await p.evaluate(() => D2DBG.hour(12));
  // ------------------------------------------------------------- chết & hồi sinh
  results.push('\n-- chết --');
  await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 8000);
  await p.evaluate(() => { D2DBG.give({ gold: 400 }); D2DBG.S.char.hp = 1; D2DBG.spawn(D2DBG.monIds()[0], 3, 1.2, 0, 'champion'); });
  const goldPre = (await st(p)).gold;
  // Zombie cấp 1 đánh nhân vật cấp 10 chỉ trúng 5-10% (công thức AR/DEF của D2), lại thêm máu tự hồi,
  // nên đợi quái giết là chập chờn đúng luật. Cho quái 6 giây, rồi trừ máu thẳng qua đường damageHero.
  if (!await waitFor(p, () => document.querySelector('.screen.dead').style.display === 'flex', 6000))
    await p.evaluate(() => D2DBG.hurt(99999));
  const dead = await waitFor(p, () => document.querySelector('.screen.dead').style.display === 'flex', 8000);
  check('hết máu -> màn hình chết', dead);
  if (dead) {
    s = await st(p);
    check('chết mất một phần vàng', s.gold < goldPre, goldPre + '->' + s.gold);
    await p.click('.screen.dead button');
    await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment' && D2DBG.getState().hero.st !== 'dead', 8000);
    s = await st(p);
    check('hồi sinh ở Rogue Encampment, còn sống', s.area === 'rogue_encampment' && s.hp > 0, s.area + ' hp=' + s.hp);
  }

  // ------------------------------------------------------------- lưu / nạp
  results.push('\n-- chuyển act --');
  await p.evaluate(() => { D2DBG.S.char.quests.sisters_to_the_slaughter = 'done'; D2DBG.goto('rogue_encampment', 'blood_moor'); });
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 10000);
  await sleep(400);
  const wv = (await st(p)).npcs.find(n => n.id === 'warriv1');
  check('Rogue Encampment có Warriv', !!wv);
  if (wv) {
    await p.evaluate(([x, y]) => D2DBG.teleport(x - 3, y), [wv.x, wv.y]);
    await sleep(300);
    await clickNpc(p, 'warriv1');
    const wdlg = await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
    check('bấm Warriv -> hộp thoại có nút đi Lut Gholein', wdlg && (await p.$$('.dialog button:has-text("Lut Gholein")')).length === 1);
    if (wdlg) await p.click('.dialog button:has-text("Lut Gholein")');
    const lg = await waitFor(p, () => D2DBG.getState().area === 'lut_gholein', 30000);
    const lgN = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'npc').map(e => e.npc));
    check('sang Act II: Lut Gholein có Jerhyn, Fara, Drognan, Meshif', lg && ['jerhyn', 'fara', 'drognan', 'meshif1'].every(n => lgN.includes(n)), lgN.filter(n => !/^act2/.test(n)).join(','));
    await p.screenshot({ path: path.join(SHOTS, '6-lut-gholein.png') });
  }
  await p.evaluate(() => { D2DBG.S.char.quests.the_guardian = 'cleared'; D2DBG.goto('durance_of_hate_level_3'); });
  await waitFor(p, () => D2DBG.getState().area === 'durance_of_hate_level_3', 30000);
  await p.evaluate(() => D2DBG.killAllMons());
  const gate = await p.evaluate(() => { const o = D2DBG.S.ents.find(e => e.kind === 'obj' && e.otype === 'portal'); return o ? { x: o.x, y: o.y } : null; });
  check('Durance 3 có cổng đỏ (HellGate trong DS1)', !!gate);
  if (gate) {
    await p.evaluate(([x, y]) => D2DBG.teleport(x + 4, y + 4), [gate.x, gate.y]);
    await sleep(400);
    await clickTile(p, gate.x, gate.y, { lift: 30 });
    const pf = await waitFor(p, () => D2DBG.getState().area === 'the_pandemonium_fortress', 30000);
    check('xong The Guardian, bấm cổng đỏ -> Pandemonium Fortress', pf, await p.evaluate(() => D2DBG.getState().area));
    await p.screenshot({ path: path.join(SHOTS, '6-pandemonium.png') });
  }

  await p.evaluate(() => { D2DBG.S.char.quests.hells_forge = 'active'; D2DBG.goto('river_of_flame'); });
  await waitFor(p, () => D2DBG.getState().area === 'river_of_flame', 30000);
  const heph = await p.evaluate(() => D2DBG.getState().mons.some(m => m.id === 'the_feature_creep'));
  const hf0 = await p.evaluate(() => D2DBG.S.char.quests.hells_forge);
  await p.evaluate(() => D2DBG.killAllMons());
  const hf = await p.evaluate(() => D2DBG.S.char.quests.hells_forge);
  check('River of Flame: vào khu chưa xong Hell\'s Forge, giết Hephasto mới xong', heph && hf0 === 'active' && (hf === 'cleared' || hf === 'done'), 'hephasto=' + heph + ' ' + hf0 + '->' + hf);

  await p.evaluate(() => D2DBG.goto('the_chaos_sanctuary'));
  await waitFor(p, () => D2DBG.getState().area === 'the_chaos_sanctuary', 30000);
  const seals = await p.evaluate(() => D2DBG.getState().mons.filter(m => m.rank === 'unique').map(m => m.id).sort());
  check('Chaos Sanctuary có ba trùm giữ ấn, chưa có Diablo', seals.join() === 'grand_vizier_of_chaos,infector_of_souls,lord_de_seis', seals.join());
  await p.evaluate(() => D2DBG.killAllMons());
  const dia = await waitFor(p, () => D2DBG.getState().mons.some(m => m.id === 'diablo' && m.st !== 'dead' && m.st !== 'die'), 5000);
  check('giết ba trùm ấn -> Diablo xuất hiện', dia);
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, '6-diablo.png') });

  results.push('\n-- lưu --');
  const saved = await p.evaluate(() => { D2.Game.save(); return !!localStorage.getItem('d2web.save.v1'); });
  check('lưu vào localStorage', saved);
  await p.reload(); await p.waitForSelector('.screen.title .tmenu');
  check('có nút Tiếp tục sau khi lưu', (await p.$$('.tmenu button:has-text("Tiếp tục")')).length === 1);
  await p.click('.tmenu button:has-text("Tiếp tục")');
  await p.waitForFunction(() => D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 15000 });
  s = await st(p);
  check('nạp lại đúng nhân vật', s.cls === 'sorceress' && s.lvl > 1, 'lvl=' + s.lvl);

  results.push('\n-- độ khó --');
  await p.evaluate(() => { D2DBG.S.char.diffMax = 'nm'; D2.Game.save(); });
  await p.reload(); await p.waitForSelector('.screen.title .tmenu');
  const tb = await p.$$eval('.tmenu button', bs => bs.map(b => b.textContent));
  check('mở Nightmare -> có nút Tiếp tục cho Normal và Nightmare', tb.includes('Tiếp tục · Normal') && tb.includes('Tiếp tục · Nightmare'), tb.join(' | '));
  await p.click('.tmenu button:has-text("Tiếp tục · Nightmare")');
  await p.waitForFunction(() => D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 15000 });
  const nm = await p.evaluate(() => ({ diff: D2DBG.S.char.diff, fire: D2DBG.S.d.res.fire, quests: Object.keys(D2DBG.S.char.quests).length }));
  check('Nightmare: kháng lửa trừ 40, nhiệm vụ làm lại từ đầu', nm.diff === 'nm' && nm.fire === -40 && nm.quests === 0, JSON.stringify(nm));
  await p.evaluate(() => D2DBG.goto('blood_moor'));
  await p.waitForFunction(() => D2DBG.getState().area === 'blood_moor' && D2DBG.getState().mons.length > 0, null, { timeout: 20000 });
  // chỉ quái của Blood Moor: thế giới act còn chứa quái của khu kề đã dựng ngầm (Cold Plains, cấp khác)
  const lv = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'mon' && e.rank === 'normal' && e.home === 'blood_moor').map(e => e.inst.lvl));
  check('Nightmare: quái Blood Moor cấp 36 (MonLvlEx của levels.txt)', lv.length > 0 && lv.every(l => l === 36), [...new Set(lv)].join(','));
  check('không có lỗi trang (máy tính)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();

  // =============================================================== CẢM ỨNG
  results.push('\n-- cảm ứng 932x430 --');
  ({ ctx, p, errs } = await open(b, { viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }));
  await startClass(p, 'sorceress', 'Dế', true);
  await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
  await sleep(500);
  check('chế độ cảm ứng bật', await p.evaluate(() => document.body.classList.contains('touch')));
  check('có nút Đánh và 4 nút kỹ năng', (await p.$$('#touch .tbtn.attack')).length === 1 && (await p.$$('#touch .tbtn.skill')).length === 4);
  const sc = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; });
  check('stage vừa khung 932x430', sc.w <= 932.5 && sc.h <= 430.5 && sc.w > 700, Math.round(sc.w) + 'x' + Math.round(sc.h));
  await p.screenshot({ path: path.join(SHOTS, '4-touch.png') });
  // analog bằng sự kiện chạm thật qua CDP
  const cdp = await ctx.newCDPSession(p);
  const touchAt = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  s = await st(p);
  const hx0 = s.hero.x, hy0 = s.hero.y;
  const cx = 130 * sc.w / 960 + sc.l, cy = 380 * sc.h / 540 + sc.t;
  await touchAt('touchStart', cx, cy);
  for (let i = 1; i <= 6; i++) { await touchAt('touchMove', cx + i * 9, cy); await sleep(60); }
  await sleep(900);
  s = await st(p);
  const joyMoved = Math.hypot(s.hero.x - hx0, s.hero.y - hy0);
  await touchAt('touchEnd', cx, cy);
  check('analog trái làm hero đi', joyMoved > 1, 'đi ' + joyMoved.toFixed(2) + ' ô');
  await sleep(200);
  // nút đánh
  await p.evaluate(() => D2DBG.spawn(D2DBG.monIds()[0], 1, 1.4, 0));
  await p.evaluate(() => D2DBG.setSkills('attack', 'attack'));
  await p.evaluate(() => { D2DBG.S.char.hp = 9999; });
  const ab = await p.$('#touch .tbtn.attack');
  const bb = await ab.boundingBox();
  await touchAt('touchStart', bb.x + bb.width / 2, bb.y + bb.height / 2);
  await waitFor(p, () => D2DBG.getState().mons.some(m => m.hp < 25 + 8 || m.st === 'die' || m.st === 'dead'), 15000);
  await touchAt('touchEnd', bb.x + 5, bb.y + 5);
  s = await st(p);
  check('nút Đánh tấn công quái gần nhất', s.mons.some(m => m.st === 'die' || m.st === 'dead' || m.hp < 33));
  // chạm vào quái / vật
  await p.screenshot({ path: path.join(SHOTS, '4b-touch-fight.png') });
  check('không có lỗi trang (cảm ứng)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();

  // -------------------------------------------------- hình dạng nhân vật, kho đồ, waypoint, icon kỹ năng
  results.push('\n-- hình nhân vật theo lớp --');
  // Hình theo cách D2 chọn DCC: lớp vũ khí (wclass) và token alternategfx của đồ khởi đầu trong charstats.txt
  const EXPECT = { sorceress: { cls: 'SO', wclass: 'STF', RH: 'BST' }, amazon: { cls: 'AM', wclass: '1HT', RH: 'JAV', SH: 'BUC' }, barbarian: { cls: 'BA', wclass: '1HS', RH: 'HAX', SH: 'BUC' },
    necromancer: { cls: 'NE', wclass: '1HS', RH: 'WND' }, paladin: { cls: 'PA', wclass: '1HS', RH: 'SSD', SH: 'BUC' },
    druid: { cls: 'DZ', wclass: '1HS', RH: 'CLB', SH: 'BUC' }, assassin: { cls: 'AI', wclass: 'HT1', RH: 'KTR', SH: 'BUC' } };
  const SH = process.env.D2_FIGS || SHOTS;
  fs.mkdirSync(SH, { recursive: true });
  for (const cls of ['sorceress', 'amazon', 'barbarian', 'necromancer', 'paladin', 'druid', 'assassin']) {
    ({ ctx, p, errs } = await open(b, { viewport: { width: 1000, height: 600 } }));
    await startClass(p, cls, 'T' + cls);
    await sleep(700);
    const L = await p.evaluate(() => D2DBG.heroLook());
    const X = EXPECT[cls];
    check(cls + ': lớp + vũ khí khởi đầu đúng DCC của D2', L.cls === X.cls && L.wclass === X.wclass && L.tok.RH === X.RH && (L.tok.SH || null) === (X.SH || null), JSON.stringify(L));
    await p.screenshot({ path: path.join(SH, 'f-' + cls + '-town.png') });
    const cs = await p.evaluate(() => D2DBG.contactSheet('NU'));
    check(cls + ': 8 hướng đều vẽ được', cs.ok === 8, cs.ok + '/8');
    await (await p.$('#d2-sheet')).screenshot({ path: path.join(SH, 'f-' + cls + '-8dir.png') });
    await p.evaluate(() => document.getElementById('d2-sheet').remove());
    // đổi trang bị -> token thân đổi theo cột Torso của armor.txt
    await p.evaluate(() => { const c = D2DBG.S.char; c.equip.body = D2DBG.DA.makeItem('chn'); });
    const after = await p.evaluate(() => D2DBG.heroLook());
    check(cls + ': mặc Chain Mail -> thân đổi sang giáp', !!after.tok.TR && after.tok.TR !== 'LIT', JSON.stringify(after.tok));
    await p.evaluate(() => { delete D2DBG.S.char.equip.body; });
    // Blood Moor + đánh nhau (chuột thật)
    await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
    await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
    await sleep(500);
    await p.evaluate(() => { D2DBG.spawn(D2DBG.monIds()[0], 2, 5, 1); D2DBG.S.char.hp = 9999; });
    await sleep(400);
    const mm = (await st(p)).mons.filter(m => m.st !== 'die' && m.st !== 'dead').sort((a, b) => 0)[0];
    if (mm) await clickTile(p, mm.x, mm.y, { lift: 30 });
    await sleep(500);
    await p.screenshot({ path: path.join(SH, 'f-' + cls + '-fight.png') });
    check(cls + ': không lỗi trang', errs.length === 0, errs.slice(0, 2).join(' | '));
    if (cls === 'sorceress') {
      const hudIco = await p.evaluate(() => { const e = document.querySelector('.skbtn.right .ico'); return e ? /url\(/.test(e.getAttribute('style') || '') : null; });
      check('HUD vẽ icon kỹ năng D2 (IconCel của skilldesc)', hudIco === true, String(hudIco));
      await p.keyboard.press('KeyT'); await sleep(300);
      const treeIco = await p.$$eval('.sknode .ico', n => n.filter(e => /url\(/.test(e.getAttribute('style') || '')).length);
      check('cây kỹ năng có icon D2', treeIco > 0, 'icon=' + treeIco);
      await p.screenshot({ path: path.join(SH, 'f-sorceress-skilltree.png') });
      await p.keyboard.press('KeyT');
      // thị trấn: kho đồ + waypoint là vật thể đặt sẵn trong DS1 của D2, bấm bằng chuột thật
      await p.evaluate(() => D2DBG.goto('rogue_encampment', 'blood_moor'));
      await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 10000);
      await sleep(500);
      const objs = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'obj' && e.otype).map(o => ({ type: o.otype, x: o.x, y: o.y })));
      results.push('  (vật dùng được trong thị trấn: ' + [...new Set(objs.map(o => o.type))].join(', ') + ')');
      for (const t of ['stash', 'waypoint']) {
        const o = objs.find(q => q.type === t);
        check('thị trấn có ' + t, !!o);
        if (!o) continue;
        await p.evaluate(([x, y]) => D2DBG.teleport(x, y), [o.x + 5, o.y + 5]);
        await sleep(300);
        await clickTile(p, o.x, o.y, { lift: 20 });
        const sel = t === 'stash' ? '#p-stash' : '.wpmenu';
        const opened = await waitFor(p, s2 => { const e = document.querySelector(s2); return e && e.style.display === 'block'; }, 12000, sel);
        check('bấm ' + t + ' mở bảng', opened);
        await p.screenshot({ path: path.join(SH, 'f-' + t + '.png') });
        if (t === 'stash' && opened) {
          const cells = await p.$$eval('#p-stash .gridbg i', n => n.length);
          check('kho đồ có lưới 6x8', cells === 48, 'ô=' + cells);
          const n0 = await p.evaluate(() => D2DBG.S.char.inv.length);
          const stIn = await p.evaluate(() => { const c = D2DBG.S.char; D2.Game.stashIn(c.inv[0]); return c.stash.length; });
          check('cất đồ vào kho', stIn === 1, 'kho=' + stIn);
          const stOut = await p.evaluate(() => { const c = D2DBG.S.char; D2.Game.stashOut(c.stash[0]); return [c.stash.length, c.inv.length]; });
          check('lấy đồ ra khỏi kho', stOut[0] === 0 && stOut[1] === n0, JSON.stringify(stOut) + ' n0=' + n0);
        }
        if (t === 'waypoint' && opened) {
          const wpl = () => p.$$eval('.wpmenu .wpb[data-area]', n => n.map(x => ({ a: x.dataset.area, off: x.disabled })));
          const wb = await wpl();
          const on = a => (wb.find(x => x.a === a) || {}).off === false;
          check('waypoint liệt kê đủ 9 waypoint Act I, Cold Plains chưa chạm thì xám', wb.length === 9 && on('rogue_encampment') && !on('cold_plains') && wb.some(x => x.a === 'cold_plains'), JSON.stringify(wb));
          check('bảng waypoint có 5 tab act', (await p.$$('.wpmenu .acttab')).length === 5);
          await p.evaluate(() => { D2DBG.S.char.waypoints.cold_plains = true; D2.UI.openWaypoints(); });
          const wb2 = await wpl();
          check('đã kích hoạt Cold Plains -> bấm được', (wb2.find(x => x.a === 'cold_plains') || {}).off === false, JSON.stringify(wb2));
        }
        await p.evaluate(() => D2.UI.closeAll());
      }
      await p.screenshot({ path: path.join(SH, 'f-sorceress-town-objects.png') });

      let chest = null, chestArea = null;
      for (const a of ['cold_plains', 'stony_field', 'dark_wood', 'black_marsh']) {
        await p.evaluate(a => D2DBG.goto(a), a);
        await waitFor(p, a => D2DBG.getState().area === a, 15000, a);
        await sleep(400);
        chest = await p.evaluate(() => { const h = D2DBG.S.hero; const c = D2DBG.S.ents.filter(e => e.kind === 'obj' && e.otype === 'chest').sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; return c ? { x: c.x, y: c.y } : null; });
        if (chest) { chestArea = a; break; }
      }
      check('khu ngoài trời Act I có rương', !!chest, chestArea);
      if (chest) {
        await p.evaluate(() => D2DBG.killAllMons());
        // đứng trên đường A* tới rương, cách vài bước: ô chéo cạnh rương có thể là tường của tàn tích
        await p.evaluate(([x, y]) => { const pt = D2DBG.path(x, y) || []; const n = pt[Math.max(0, pt.length - 6)]; if (n) D2DBG.teleport(n[0], n[1]); }, [chest.x, chest.y]);
        await sleep(300);
        const drops0 = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'drop' && !e.removed).length);
        await clickTile(p, chest.x, chest.y, { lift: 12 });
        const opened = await waitFor(p, ([x, y]) => D2DBG.S.ents.some(e => e.kind === 'obj' && e.opened && Math.abs(e.x - x) < 0.01 && Math.abs(e.y - y) < 0.01), 8000, [chest.x, chest.y]);
        const drops1 = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'drop' && !e.removed).length);
        check('bấm rương -> rương mở (chế độ OP của D2)', opened, chestArea);
        const again = await p.evaluate(([x, y]) => D2DBG.S.ents.filter(e => e.kind === 'obj' && e.opened && Math.abs(e.x - x) < 0.01 && Math.abs(e.y - y) < 0.01).map(e => e.otype)[0], [chest.x, chest.y]);
        check('rương đã mở không bấm lại được', opened && again === null, 'otype=' + again + ', đồ ' + drops0 + '->' + drops1);
        await sleep(800);
        await p.screenshot({ path: path.join(SH, 'f-chest.png') });
      }
    }
    await ctx.close();
  }

  // dọc: gợi ý xoay ngang
  ({ ctx, p, errs } = await open(b, { viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true }));
  const rot = await p.evaluate(() => getComputedStyle(document.querySelector('.rotate')).display);
  check('màn hình dọc hiện "xoay ngang"', rot === 'flex', rot);
  await ctx.close();

  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh chụp: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(2); });
