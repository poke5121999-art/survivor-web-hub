/*
 * HỐ XANH — màn chuẩn bị (js/prep.js): Trang bị (iDiver), Súng, Quán.
 *
 * Chạy:  node test/ho-xanh-prep.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-shots/prep) — mở ra xem bằng mắt.
 * Chạy ở 1280×720 (chuột + bàn phím) và 844×390 (cảm ứng: page.tap).
 * Kiểm: 0 vàng thì mọi nút mua bị từ chối có báo và sổ không đổi; cho vàng thì nâng O₂ trừ đúng giá, ô hiện cấp mới;
 * mua + mang súng ghi vào save.guns; nâng quán; tải lại còn nguyên; Ra khơi sang cano; không tràn khung; không lỗi trang.
 * Bố cục iDiver/Duff đọc từ art/gear/{idiver,duff}/layout (tools/rip_ui.py), không còn sprite thay tạm; font gốc (css/fonts.css) đã nạp,
 * chữ không tràn hộp (chữ dài chạy vòng theo UITextScroller gốc thì bỏ qua); ảnh 0-fonts: mẫu tiếng Việt trên hai font gốc.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-shots', 'prep');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json',
  '.ttf': 'font/ttf', '.otf': 'font/otf' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Mọi nút đang hiện phải nằm trọn trong khung nhìn (theo chiều ngang) và trong vùng cuộn chứa nó (theo chiều dọc thì cuộn tới được).
async function layoutIssues(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad = [];
    const app = document.querySelector('.pr-app');
    if (app.scrollWidth > app.clientWidth + 1) bad.push('app tràn ngang ' + app.scrollWidth + '>' + app.clientWidth);
    document.querySelectorAll('#scr-prep button, #scr-prep .pr-gold, #scr-prep .pr-head h2, #scr-prep .pr-title').forEach(b => {
      const r = b.getBoundingClientRect();
      if (!r.width) return;
      const scroller = b.closest('.pr-list');
      const box = scroller ? scroller.getBoundingClientRect() : { left: 0, right: W, top: 0, bottom: H };
      if (r.left < box.left - 1 || r.right > box.right + 1) bad.push('ngang: ' + (b.id || b.className) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      if (!scroller && (r.top < -1 || r.bottom > H + 1)) bad.push('dọc: ' + (b.id || b.className) + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom));
      // chữ bị cắt: nội dung rộng hơn hộp (trừ chỗ cố ý ellipsis)
      if (b.tagName === 'BUTTON' && b.scrollWidth > b.clientWidth + 2) bad.push('chữ tràn nút: ' + b.textContent);
    });
    const panel = document.querySelector('.pr-barpanel'), ar = app.getBoundingClientRect();
    if (panel) { const pr = panel.getBoundingClientRect(); if (pr.bottom > ar.bottom + 1 || pr.top < ar.top - 1) bad.push('khung quán lọt ra ngoài ' + Math.round(pr.top) + '..' + Math.round(pr.bottom)); }
    // cỡ chữ nhỏ nhất của chữ đang hiện
    let minFont = 99;
    document.querySelectorAll('#scr-prep .pr-app *').forEach(e => {
      if (!e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
      const r = e.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > H) return;
      minFont = Math.min(minFont, parseFloat(getComputedStyle(e).fontSize));
    });
    return { bad, minFont };
  });
}

// Chữ dựng từ bố cục (.pt) tràn hộp: rộng hơn hộp (trừ chữ chạy vòng .pt-run), hoặc nét chữ thật (đo bằng canvas
// measureText, có tính size-adjust của font) cao hơn hộp. scrollHeight không dùng được cho chữ một dòng: vùng nội dung
// Snowstorm ×1,3 luôn cao hơn nét chữ, như TMP gốc để chữ tràn khung dọc mà không cắt.
// Mọi icon ô (.pr-icon) đã tải xong (naturalWidth > 0) và hiện; mọi xu trong ô giá có bề rộng và ảnh Coin gốc.
// Đo ngay lúc chụp ảnh, không chờ: ảnh phải có từ khung đầu (prep.js nạp sẵn khi vào pha).
async function iconIssues(page) {
  return page.evaluate(() => {
    const bad = [], vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && +cs.opacity > 0; };
    const icons = [...document.querySelectorAll('#scr-prep .pr-row .pr-icon')];
    icons.forEach(i => {
      const k = i.closest('.pr-row').dataset.key;
      if (!i.complete || !i.naturalWidth) bad.push(k + ': icon chưa tải ' + i.getAttribute('src'));
      else if (!vis(i)) bad.push(k + ': icon không hiện');
    });
    const coins = [...document.querySelectorAll('#scr-prep .pr-row .pr-cost [data-n="CoinIcon"]')];
    coins.forEach(c => {
      const k = c.closest('.pr-row').dataset.key;
      if (!vis(c) || !/Coin/.test(c.style.backgroundImage)) bad.push(k + ': xu giá không hiện ' + Math.round(c.getBoundingClientRect().width) + 'px');
    });
    return { bad, icons: icons.length, coins: coins.length };
  });
}

async function textOverflow(page) {
  return page.evaluate(() => {
    const cx = document.createElement('canvas').getContext('2d');
    return [...document.querySelectorAll('#scr-prep .pt')].filter(e => {
      if (!e.getClientRects().length || getComputedStyle(e).visibility === 'hidden' || !e.textContent.trim()) return false;
      const r = e.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return false;
      if (e.classList.contains('wrap')) return e.scrollHeight > e.clientHeight + 2;
      if (!e.querySelector('.pt-run') && e.scrollWidth > e.clientWidth + 1) return true;
      const cs = getComputedStyle(e), lines = (e.querySelector('.pt-run > span') || e).textContent.split(String.fromCharCode(10));
      cx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const ink = lines.reduce((h, t) => { const m = cx.measureText(t); return h + m.actualBoundingBoxAscent + m.actualBoundingBoxDescent; }, 0);
      e.dataset.ink = Math.round(ink);
      return ink > e.clientHeight + 1;
    }).map(e => (e.dataset.n || e.className) + ': ' + e.textContent + ' w ' + e.scrollWidth + '/' + e.clientWidth + ' ink ' + e.dataset.ink + '/' + e.clientHeight);
  });
}

async function run(browser, base, W, H, touch) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + (touch ? ' cảm ứng' : ' chuột + bàn phím') + ']');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const save = () => page.evaluate(() => HX_DEBUG.save());
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const press = async sel => { if (touch) await page.tap(sel); else await page.click(sel); };
  const text = sel => page.textContent(sel);
  const url = base + '/games/ho-xanh/index.html?phase=prep';

  await page.goto(url + '&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'prep' && document.querySelector('.pr-row'));
  await sleep(900);
  let S = await save();
  check('sổ mới vào thẳng màn chuẩn bị, 0 vàng, ngày 1', S.gold === 0 && S.day === 1 && (await text('.pr-gold')) === '0 vàng' && (await text('.pr-head h2')) === 'Ngày 1',
    await text('.pr-gold') + ' / ' + await text('.pr-head h2'));
  const gearKeys = await page.$$eval('#scr-prep .pr-row', r => r.map(e => e.dataset.key));
  // trang bị (có drone) rồi tới các đầu mũi xiên
  const metaGear = await page.evaluate(() => Object.keys(HX_META.GEAR).concat(Object.keys(HX_META.HEADS).map(id => 'head:' + id)));
  check('thẻ Trang bị dựng đủ các dòng của HX_META.GEAR rồi HX_META.HEADS theo thứ tự', JSON.stringify(gearKeys) === JSON.stringify(metaGear), gearKeys.join(','));
  const srcs = await page.$$eval('#scr-prep .pr-row .pr-icon', e => e.map(i => i.getAttribute('src').split('?')[0]));
  const metaIcons = await page.evaluate(() => Object.keys(HX_META.GEAR).map(k => HX_META.GEAR[k].icon).concat(Object.keys(HX_META.HEADS).map(k => HX_META.HEADS[k].icon)));
  check('ô trang bị dùng icon iDiver gốc trong HX_META.GEAR, ô đầu xiên dùng icon Item_*HarpoonHead gốc', JSON.stringify(srcs) === JSON.stringify(metaIcons), srcs.map(s => s.split('/').pop()).join(', '));
  let L = await layoutIssues(page);
  check('thẻ Trang bị không tràn khung, không nút bị cắt', !L.bad.length, L.bad.slice(0, 4).join(' | '));
  check('chữ nhỏ nhất ≥ 10 px', L.minFont >= 10, L.minFont + ' px');
  await shot('1-gear');
  let IC = await iconIssues(page);
  check('thẻ Trang bị: mọi icon ô đã tải (naturalWidth > 0) và hiện ngay lúc chụp, mọi ô giá có xu', !IC.bad.length && IC.icons === metaGear.length,
    IC.icons + ' icon, ' + IC.coins + ' xu ' + IC.bad.slice(0, 4).join(' | '));
  const lay = await page.evaluate(() => ({ lay: HX.prep.debug.layouts(), st: HX.prep.debug.standins() }));
  check('bố cục iDiver + Duff đọc từ JSON gốc, không còn sprite thay tạm', ['panel', 'cell', 'duffApp', 'newWeaponTitle'].every(k => (lay.lay || []).includes(k)) && !Object.keys(lay.st).length,
    JSON.stringify(lay));
  // ---------- font gốc ----------
  const F = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].filter(f => /HX /.test(f.family)).map(f => f.family.replace(/"/g, '') + ':' + f.status);
    const ff = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily : null; };
    return { faces, title: ff('.pr-row .pr-title'), lv: ff('.pr-row .pr-lv.cur'), gold: ff('.pr-goldn .hx-f-num') };
  });
  check('font gốc Roboto-Medium và Snowstorm đã nạp', F.faces.includes('HX Roboto:loaded') && F.faces.includes('HX Snowstorm:loaded'), F.faces.join(', '));
  check('tên ô tiếng Việt dùng Roboto gốc, "Lv.1" và số vàng dùng Snowstorm gốc', /HX Roboto/.test(F.title) && /HX Snowstorm/.test(F.lv) && /HX Snowstorm/.test(F.gold),
    F.title + ' | ' + F.lv + ' | ' + F.gold);
  let O = await textOverflow(page);
  check('thẻ Trang bị: chữ không tràn hộp', !O.length, O.slice(0, 3).join(' | '));
  if (!touch) {
    // mẫu tiếng Việt trên hai font gốc; chữ font thiếu thì rơi xuống monospace cho dễ thấy
    await page.evaluate(() => {
      const T = 'Bình dưỡng khí · Súng bắn tỉa · Sushi cá mú chấm', d = document.createElement('div');
      d.id = 'hx-font-sample';
      d.style.cssText = 'position:fixed;inset:0;z-index:99;background:#0b43b9;color:#fff;padding:24px;font-size:30px;line-height:1.6';
      [['HX Roboto', 'Roboto-Medium (--font-ui)'], ['HX Snowstorm', 'Snowstorm (--font-num), chữ thiếu hiện bằng monospace'], ['HX Snowstorm', 'Snowstorm, số']].forEach((f, i) => {
        const r = document.createElement('div'), l = document.createElement('div');
        l.textContent = f[1]; l.style.cssText = 'font:14px monospace;color:#ffe400';
        r.textContent = i === 2 ? '0123456789 · 12 450 vàng · Lv.3 → Lv.4 · 90 → 120 · MAX LEVEL · UPGRADE' : T;
        r.style.fontFamily = "'" + f[0] + "', monospace";
        d.appendChild(l); d.appendChild(r);
      });
      document.body.appendChild(d);
    });
    await page.evaluate(() => document.fonts.ready);
    await sleep(200);
    await shot('0-fonts');
    await page.evaluate(() => document.getElementById('hx-font-sample').remove());
  }

  // ---------- 0 vàng: mọi nút mua đều bị từ chối, có báo, sổ không đổi ----------
  const before = JSON.stringify(await save());
  const refused = [];
  for (const t of ['gear', 'guns', 'bar']) {
    await press('.pr-tab[data-tab="' + t + '"]');
    // dòng giá 0 (đồ lặn cấp 1 bản gốc tặng theo cốt truyện) mua được cả khi 0 vàng: bỏ qua
    const keys = await page.evaluate(t => Object.keys(t === 'guns' ? HX_META.GUNS : HX_META[t === 'gear' ? 'GEAR' : 'BAR'])
      .filter(k => (t === 'guns' ? HX_META.GUNS[k].cost : HX_META.nextCost(HX_DEBUG.save(), k)) > 0), t);
    for (const k of keys) {
      await press('.pr-row[data-key="' + k + '"] .pr-buy');
      const m = await page.$eval('.pr-msg', e => ({ t: e.textContent, vis: getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0 }));
      const pop = await page.evaluate(() => HX.prep.debug.popup());
      if (!(m.vis && m.t.includes('thiếu tiền') && !pop)) refused.push(t + '/' + k + ': ' + JSON.stringify(m) + ' pop=' + pop);
    }
    if (t === 'gear') await shot('2-refused');
  }
  check('0 vàng: bấm mua ở mọi dòng có giá đều hiện "thiếu tiền", không bật bảng', !refused.length, refused.slice(0, 3).join(' | '));
  check('0 vàng: sổ lưu không đổi', JSON.stringify(await save()) === before);

  // ---------- cho vàng, nâng O₂ ----------
  await page.evaluate(() => HX_DEBUG.grant(5000));
  await page.waitForFunction(() => document.querySelector('.pr-gold').textContent === '5000 vàng');
  await press('.pr-tab[data-tab="gear"]');
  const o2 = await page.evaluate(() => ({ cost: HX_META.nextCost(HX_DEBUG.save(), 'o2'), next: HX_META.GEAR.o2.levels[1].value }));
  check('ô O₂ hiện giá gốc cấp kế tiếp và chỉ số hiện tại → kế tiếp', (await text('.pr-row[data-key="o2"] .pr-cost')).trim() === String(o2.cost) &&
    (await text('.pr-row[data-key="o2"] .pr-stat.next .pr-stv')).startsWith(String(o2.next)),
    (await text('.pr-row[data-key="o2"] .pr-cost')) + ' / ' + (await text('.pr-row[data-key="o2"] .pr-stat.next')));
  await press('.pr-row[data-key="o2"] .pr-buy');
  await sleep(450);
  S = await save();
  check('nâng O₂: trừ đúng ' + o2.cost + ' vàng, lên cấp 1', S.gold === 5000 - o2.cost && S.gear.o2 === 1, S.gold + ' vàng, o2=' + S.gear.o2);
  check('ô O₂ hiện cấp mới (Lv.2) và giá cấp sau', (await text('.pr-row[data-key="o2"] .pr-lv.cur')) === 'Lv.2', await text('.pr-row[data-key="o2"] .pr-lv.cur'));
  check('vàng trên đầu trang cập nhật', (await text('.pr-gold')) === (5000 - o2.cost) + ' vàng', await text('.pr-gold'));
  let fx = await page.evaluate(() => ({ pop: HX.prep.debug.popup(), parts: HX.prep.debug.particles(), sys: HX.prep.debug.systems(), snd: HX.prep.debug.sounds() }));
  check('mua xong bật bảng NÂNG CẤP của iDiver với hạt VFX gốc đang chạy', fx.pop === 'idv' && fx.parts > 5 && fx.sys >= 4, JSON.stringify(fx));
  check('tiếng UI gốc đã giải mã (ui_levelup, ui_fail…)', ['ui_levelup', 'ui_fail', 'ui_buy', 'ui_click'].every(k => fx.snd.includes(k)), fx.snd.join(','));
  await shot('3-gear-upgrade');
  O = await textOverflow(page);
  check('bảng lên cấp: chữ không tràn hộp', !O.length, O.slice(0, 3).join(' | '));
  await sleep(700);
  await shot('3b-gear-upgrade-later');
  await press('.pr-lup-ok');
  check('Xác nhận đóng bảng', (await page.evaluate(() => HX.prep.debug.popup())) === null);

  // ---------- súng ----------
  await press('.pr-tab[data-tab="guns"]');
  const gunKeys = await page.$$eval('#scr-prep .pr-row', r => r.map(e => e.dataset.key));
  check('thẻ Súng dựng đủ 6 khẩu từ HX_META.GUNS', JSON.stringify(gunKeys) === JSON.stringify(await page.evaluate(() => Object.keys(HX_META.GUNS))), gunKeys.join(','));
  const gthumb = await page.$eval('.pr-row[data-key="rifle"] .pr-icon', i => i.getAttribute('src').split('?')[0]);
  check('ô súng dùng icon gốc của khẩu súng', gthumb === await page.evaluate(() => HX_META.GUNS.rifle.icon), gthumb);
  const stats = await text('.pr-row[data-key="shotgun"] .pr-gstats');
  check('ô súng hoa cải hiện sát thương, số đạn, tầm, số viên toả', /Sát thương\s*12/.test(stats) && /Số đạn\s*6/.test(stats) && /Tầm bắn\s*3 m/.test(stats) && /Số viên\s*3/.test(stats), stats);
  L = await layoutIssues(page);
  check('thẻ Súng không tràn khung', !L.bad.length, L.bad.slice(0, 4).join(' | '));
  await shot('4-guns');
  IC = await iconIssues(page);
  check('thẻ Súng: mọi icon ô đã tải (naturalWidth > 0) và hiện ngay lúc chụp, mọi ô giá có xu', !IC.bad.length && IC.icons === Object.keys(await page.evaluate(() => HX_META.GUNS)).length,
    IC.icons + ' icon, ' + IC.coins + ' xu ' + IC.bad.slice(0, 4).join(' | '));
  O = await textOverflow(page);
  check('thẻ Súng: chữ không tràn hộp', !O.length, O.slice(0, 3).join(' | '));
  check('thẻ Súng dùng nền và logo app Duff gốc', await page.evaluate(() => /PhoneBg_Duff/.test(document.querySelector('.pr-bg').style.backgroundImage) &&
    /UI_WeaponCraft_Logo/.test(document.querySelector('.pr-logo.duff').style.backgroundImage)));
  const rifleCost = await page.evaluate(() => HX_META.GUNS.rifle.cost), g0 = (await save()).gold;
  await press('.pr-row[data-key="rifle"] .pr-buy');
  await sleep(300);
  S = await save();
  check('mua súng trường: trừ đúng giá, có trong kho, tự mang theo', S.gold === g0 - rifleCost && S.guns.owned.includes('rifle') && S.guns.equipped === 'rifle', JSON.stringify(S.guns) + ' ' + S.gold);
  await shot('5-gun-bought');
  const gfx = await page.evaluate(() => HX.prep.debug.fxList().map(s => s.ems.map(e => e[0]).join(',')).join(' / '));
  check('bảng súng mới phát hạt chữ NEW WEAPON của app Duff', /NewWeaponOnce|NewWeapon/.test(gfx), gfx.slice(0, 120));
  O = await textOverflow(page);
  check('bảng súng mới: chữ không tràn hộp', !O.length, O.slice(0, 3).join(' | '));
  await press('.pr-lup-ok');
  await press('.pr-row[data-key="shotgun"] .pr-buy');
  await sleep(200);
  await page.evaluate(() => { const b = document.querySelector('.pr-lup-ok'); if (b) b.click(); });
  S = await save();
  check('mua khẩu thứ hai không đổi súng đang mang', S.guns.owned.includes('shotgun') && S.guns.equipped === 'rifle', JSON.stringify(S.guns));
  await press('.pr-row[data-key="shotgun"] .pr-buy');
  S = await save();
  check('bấm "Mang theo" thì đổi sang súng hoa cải (save.guns.equipped)', S.guns.equipped === 'shotgun', JSON.stringify(S.guns));
  check('ô đang mang được tô viền, ghi ĐANG MANG', await page.$eval('.pr-row[data-key="shotgun"]', e => e.classList.contains('on') && e.textContent.includes('ĐANG MANG')));
  await press('.pr-row[data-key="shotgun"] .pr-buy');
  S = await save();
  check('bấm "Cất súng" thì không mang súng nào', S.guns.equipped === null, JSON.stringify(S.guns));
  await press('.pr-row[data-key="rifle"] .pr-buy');
  S = await save();
  check('mang lại súng trường', S.guns.equipped === 'rifle', JSON.stringify(S.guns));
  await shot('6-gun-equipped');

  // ---------- quán ----------
  await press('.pr-tab[data-tab="bar"]');
  const barKeys = await page.$$eval('#scr-prep .pr-row', r => r.map(e => e.dataset.key));
  check('thẻ Quán dựng đủ các dòng của HX_META.BAR', JSON.stringify(barKeys) === JSON.stringify(await page.evaluate(() => Object.keys(HX_META.BAR))), barKeys.join(','));
  L = await layoutIssues(page);
  check('thẻ Quán không tràn khung', !L.bad.length, L.bad.slice(0, 4).join(' | '));
  await shot('7-bar');
  const seats = await page.evaluate(() => ({ cost: HX_META.nextCost(HX_DEBUG.save(), 'seats') })), g1 = (await save()).gold;
  await press('.pr-row[data-key="seats"] .pr-buy');
  await sleep(500);
  S = await save();
  check('nâng ghế khách: trừ đúng giá, lên cấp 1', S.bar.seats === 1 && S.gold === g1 - seats.cost, S.bar.seats + ' / ' + S.gold);
  fx = await page.evaluate(() => ({ pop: HX.prep.debug.popup(), parts: HX.prep.debug.particles(), sys: HX.prep.debug.systems() }));
  check('bảng "Nâng cấp quán" gốc bật lên với hạt của CookingStudyResultPanel', fx.pop === 'bar' && fx.parts > 5, JSON.stringify(fx));
  await shot('8-bar-upgrade');
  await page.mouse.click(W / 2, H / 2);
  check('bấm vào bảng thì đóng', (await page.evaluate(() => HX.prep.debug.popup())) === null);
  // trang trí: quán cũ → sửa quán (HX_META.BAR_TIERS), bong bóng ghi tên cấp và hệ số giá món
  await page.evaluate(() => HX_DEBUG.grant(200));
  await sleep(100);
  await press('.pr-tab[data-tab="bar"]');
  const d0 = await page.$eval('.pr-row[data-key="decor"] .pr-bubin', e => e.textContent);
  check('ô Trang trí ghi tên cấp: Quán cũ → Sửa quán, ×1 → ×1,3 giá món', d0.includes('Quán cũ → Sửa quán') && /×1 → ×1,3 giá món/.test(d0), d0);
  const gd = (await save()).gold;
  await press('.pr-row[data-key="decor"] .pr-buy');
  await sleep(400);
  S = await save();
  check('nâng trang trí: trừ 120 vàng, lên cấp 1 "Sửa quán"', S.bar.decor === 1 && S.gold === gd - 120, S.bar.decor + ' / ' + S.gold);
  const popT = await page.$eval('.pr-bpop .pr-bexpl', e => e.textContent).catch(() => '');
  check('bảng nâng cấp ghi "Trang trí · Sửa quán"', popT === 'Trang trí · Sửa quán', popT);
  await shot('8b-bar-decor');
  await page.mouse.click(W / 2, H / 2);
  const d1 = await page.$eval('.pr-row[data-key="decor"] .pr-bubin', e => e.textContent);
  check('sau khi mua ô ghi Sửa quán → Góc trang trí, ×1,3 → ×1,6', d1.includes('Sửa quán → Góc trang trí') && /×1,3 → ×1,6 giá món/.test(d1), d1);

  // ---------- bàn phím (chỉ ở bản chuột) ----------
  if (!touch) {
    await press('.pr-tab[data-tab="gear"]');
    await page.focus('.pr-tab[data-tab="gear"]');
    let hops = 0, onBuy = false;
    while (hops++ < 12) {
      await page.keyboard.press('Tab');
      onBuy = await page.evaluate(() => { const a = document.activeElement; return !!a && a.classList.contains('pr-buy') && a.closest('.pr-row').dataset.key; });
      if (onBuy) break;
    }
    const k0 = onBuy, lv0 = k0 && (await save()).gear[k0];
    await page.keyboard.press('Enter');
    await sleep(200);
    S = await save();
    check('Tab tới nút mua đầu tiên rồi Enter là mua được', !!k0 && S.gear[k0] === lv0 + 1, k0 + ' ' + lv0 + '→' + (k0 && S.gear[k0]));
    await page.keyboard.press('Enter');
    check('Enter trên nút Xác nhận đóng bảng', (await page.evaluate(() => HX.prep.debug.popup())) === null);
    await page.keyboard.press('KeyE');
    check('phím E sang thẻ kế tiếp', (await page.evaluate(() => HX.prep.debug.tab())) === 'guns');
    await page.keyboard.press('KeyQ');
  }

  // ---------- tải lại ----------
  const kept = await save();
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'prep' && document.querySelector('.pr-row'));
  S = await save();
  check('tải lại trang: vàng, O₂, súng, ghế còn nguyên', S.gold === kept.gold && S.gear.o2 === kept.gear.o2 && S.guns.equipped === 'rifle' && S.bar.seats === 1,
    JSON.stringify({ gold: S.gold, o2: S.gear.o2, gun: S.guns.equipped, seats: S.bar.seats }));
  await sleep(500);
  check('ô O₂ sau khi tải lại vẫn hiện đúng cấp', (await text('.pr-row[data-key="o2"] .pr-lv.cur')) === 'Lv.' + (S.gear.o2 + 1));
  // ô cấp tối đa: nền gradient MaxLevelBG + viền MaxStroke + chữ MAX LEVEL gốc
  await page.evaluate(() => HX.save.commit(s => { s.gear.knife = HX_META.maxLevel('knife'); return s; }));
  await page.waitForFunction(() => document.querySelector('.pr-row[data-key="knife"] .pr-maxlv'));
  const mx = await page.$eval('.pr-row[data-key="knife"]', r => ({ bg: !!r.querySelector('[data-n="MaxLevelBG"]') && /gradient/.test(r.querySelector('[data-n="MaxLevelBG"]').style.backgroundImage),
    stroke: !!r.querySelector('[data-n="MaxStroke"]'), t: r.querySelector('.pr-maxlv').textContent, buy: r.querySelector('.pr-buy').disabled }));
  check('ô cấp tối đa: nền gradient gốc, viền, chữ MAX LEVEL, nút tắt', mx.bg && mx.stroke && /MAX/.test(mx.t) && mx.buy, JSON.stringify(mx));
  await page.$eval('.pr-row[data-key="knife"]', r => r.scrollIntoView({ block: 'center' }));
  await shot('9-max');
  await press('#prep-go');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'boat', null, { timeout: 15000 }).then(() => check('Ra khơi thì sang cano (pha boat)', true), () => check('Ra khơi thì sang cano (pha boat)', false));
  await sleep(300);
  check('không lỗi trang, không 404', !errors.length, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  // trang nháp: trang đầu tiên của trình duyệt hay mất WebGL (xem tools/README-boat.md)
  const warm = await browser.newPage(); await warm.goto('about:blank'); await warm.close();
  try {
    await run(browser, base, 1280, 720, false);
    await run(browser, base, 844, 390, true);
  } catch (e) { check('chạy hết bộ kiểm', false, e.stack.split('\n').slice(0, 3).join(' ')); }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
