/*
 * Thế Giới Slime (games/world-of-slime): HUD + bảng phím gốc + màn tải.
 * Kiểm: các mảnh HUD có mặt và nằm trong màn, mọi sprite HUD tải được (không 404 / lỗi ảnh), bảng phím SMActions
 * (Space đánh, LShift lướt, 1 chọn slime ô 1, Tab bản đồ nhỏ, H đổi chế độ tự đánh, không còn Shift-chạy / T huýt),
 * màn tải có thanh tiến độ theo byte. Chụp PC 1280x720, PC 1920x1080, mobile 844x390 vào D:\wos-ref\proof\hud.
 *
 * Chạy cục bộ (gốc repo + repo asset có CORS):
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   node test/world-of-slime-hud.js
 * Trên Pages: WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-hud.js
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/hud' : process.env.WOS_SHOTS;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const q = extra => '?' + ['map=dev', ASSETS ? 'assets=' + encodeURIComponent(ASSETS) : '', extra || ''].filter(Boolean).join('&');   // bản đồ thử (mặc định giờ là 257)

async function open(browser, file, opts, { slowGlb = 0, extra = '' } = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const problems = [], images = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => { if (!/login_bg\.mp4/.test(r.url())) problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText); });
  page.on('response', r => {
    if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url());
    if (/\/ui\/.*\.webp/.test(r.url())) images.push(r.status());
  });
  if (slowGlb) await page.route(/\/map\/[^/]+\.glb/, async route => { await new Promise(r => setTimeout(r, slowGlb)); route.continue(); });
  await page.goto(BASE + file + q(extra));
  return { ctx, page, problems, images };
}
const ready = p => p.page.waitForFunction(() => window.__ready || (window.__wosErrors || []).length, null, { timeout: 120000 });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };

// mảnh HUD bắt buộc: data-hud -> phải có, hiện, nằm trong khung nhìn
const PARTS = ['playerInfo', 'playerThumb', 'slimeThumb', 'level', 'menu', 'mainMenu', 'minimap', 'mapName', 'channel', 'category',
  'quest', 'slimeBar', 'slimeSlot0', 'slimeInventory', 'item0', 'item1', 'item2', 'attack', 'dash', 'chat', 'userHud', 'monsterHud'];
async function hudReport(page, more = []) {
  return page.evaluate(parts => {
    const out = {};
    for (const n of parts) {
      const e = document.querySelector(`[data-hud="${n}"]`);
      if (!e) { out[n] = 'missing'; continue; }
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      const shown = r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('[hidden]');
      const inside = r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
      out[n] = shown && inside ? 'ok' : `bad ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    }
    const sprites = [...document.querySelectorAll('#hud .spr')];
    out._sprites = sprites.length;
    out._painted = sprites.filter(s => s.style.backgroundImage || s.style.borderImage || s.style.borderImageSource).length;
    out._keycaps = document.querySelectorAll('#hud .keycap').length;
    out._joystick = !!document.querySelector('[data-hud="joystick"]');
    out._thumbPixels = (() => { const c = document.querySelector('[data-hud="playerThumb"] canvas'); if (!c) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })();
    out._s = WOS.hud.s;
    return out;
  }, [...PARTS, ...more]);
}
function checkHud(label, rep, { pc, more = [] }) {
  const bad = [...PARTS, ...more].filter(n => rep[n] !== 'ok').map(n => n + ':' + rep[n]);
  check(label + ': đủ mảnh HUD, hiện trong màn', !bad.length, bad.join(' | ') || PARTS.length + ' mảnh');
  check(label + ': sprite đã gắn ảnh', rep._sprites > 60 && rep._painted === rep._sprites, rep._painted + '/' + rep._sprites);
  check(label + ': chân dung người chơi có điểm ảnh', rep._thumbPixels > 2000, rep._thumbPixels);
  if (pc) check(label + ': có phím trên nút (ButtonKeymapOverlay)', rep._keycaps >= 7, rep._keycaps + ' (Tab Q E R Space LShift C)');
  else check(label + ': mobile có cần ảo, không có phím', rep._joystick && rep._keycaps === 0, 'joystick ' + rep._joystick + ', phím ' + rep._keycaps);
}

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const kill = setTimeout(() => { console.log('FAIL timeout 420 s'); process.exit(2); }, 420000);
  try {
    // ------------------------------------------------------------ màn tải (làm chậm GLB bản đồ để thấy thanh giữa chừng)
    console.log('màn tải (index.html 1280x720, GLB bản đồ chậm 7 s)');
    const ld = await open(browser, 'index.html', { viewport: { width: 1280, height: 720 } }, { slowGlb: 7000 });
    await ld.page.waitForSelector('#loading', { timeout: 10000 });
    await ld.page.waitForTimeout(3200);
    const l1 = await ld.page.evaluate(() => { const b = document.getElementById('loading'); return b ? { p: +b.dataset.progress, logo: !!b.querySelector('[data-hud="loadingLogo"] .spr'), video: !!b.querySelector('video'), txt: b.querySelector('.ltxt').textContent } : null; });
    await shot(ld.page, 'loading_1280x720');
    await ready(ld);
    await ld.page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 8000 }).catch(() => {});
    const l2 = await ld.page.evaluate(() => ({ gone: !document.getElementById('loading'), ready: !!window.__ready, err: (window.__wosErrors || []).slice(0, 2).join(' | '), cls: (document.getElementById('loading') || {}).className }));
    check('màn tải có video nền + logo + chữ tiến độ', l1 && l1.video && l1.logo && /%/.test(l1.txt), l1 && l1.txt);
    check('thanh tải chạy theo byte (0 < p < 0.9 khi GLB bản đồ còn treo)', l1 && l1.p > 0 && l1.p < 0.9, l1 && l1.p + ' ' + l1.txt);
    check('màn tải biến mất khi vào game', l2.gone, JSON.stringify(l2));
    await ld.ctx.close();

    // ------------------------------------------------------------ PC 1280x720: HUD + phím
    console.log('PC 1280x720');
    const pc = await open(browser, 'index.html', { viewport: { width: 1280, height: 720 } });
    await ready(pc); await pc.page.waitForTimeout(1500);
    const r1 = await hudReport(pc.page, ['questEmpty']);
    checkHud('PC 720', r1, { pc: true, more: ['questEmpty'] });
    console.log('  scale HUD ' + r1._s.toFixed(3) + ' (SMUniformCanvasScaler: 720 px -> 0.627 * 0.8 = 0.502)');
    check('PC 720: scale = 0.502', Math.abs(r1._s - 0.5016) < 0.002, r1._s.toFixed(4));
    await shot(pc.page, 'pc_1280x720');
    const k = pc.page.keyboard;
    const st = () => pc.page.evaluate(() => ({ attacks: WOS.P.attacks, dashes: WOS.P.dashes, eq: WOS.state.equipped, log: WOS.log.slice(-12),
      mini: WOS.state.minimapOpen, auto: WOS.state.autoBattle, battle: WOS.state.battle, anim: WOS.player.cur, sanim: WOS.slime.cur,
      mode: document.querySelector('[data-hud="attack"]').dataset.mode, x: WOS.P.x, z: WOS.P.z }));
    const a0 = await st();
    await k.press('Space'); await pc.page.waitForTimeout(150);
    const a1 = await st();
    check('Space = KeyboardInteractAttack: đánh', a1.attacks === a0.attacks + 1 && (a1.anim === 'SlimeAttack' || a1.sanim === 'Attack'), `${a0.attacks} -> ${a1.attacks}, ${a1.anim}/${a1.sanim}`);
    check('đang đánh: nút lớn đổi sang Return (huýt sáo)', a1.battle && a1.mode === 'return', a1.mode);
    await shot(pc.page, 'pc_1280x720_battle');
    await k.press('Space'); await pc.page.waitForTimeout(150);
    const a2 = await st();
    check('Space lần nữa khi đang đánh = Return: dừng trận', !a2.battle && a2.mode === 'disabled' && a2.attacks === a1.attacks, a2.mode);
    await k.press('ShiftLeft'); await pc.page.waitForTimeout(120);
    const a3 = await st();
    check('LShift = Dash (+ Slot1)', a3.dashes === a2.dashes + 1 && a3.log.includes('slot1'), `dashes ${a2.dashes} -> ${a3.dashes}`);
    await pc.page.evaluate(() => WOS.state.equipped = null); await k.press('Digit1'); await pc.page.waitForTimeout(120);
    const a4 = await st();
    check('1 = EquipMonster1: slime ô 1 đồng hành', a4.eq === 0 && a4.log.includes('equipped:0'), 'equipped ' + a4.eq);
    await k.press('Digit2'); await pc.page.waitForTimeout(100);
    const a5 = await st();
    check('2 = EquipMonster2 (ô trống): không đổi', a5.eq === 0 && a5.log.includes('equip1'), 'equipped ' + a5.eq);
    await k.press('Tab'); await pc.page.waitForTimeout(150);
    const a6 = await st(); await shot(pc.page, 'pc_1280x720_tab_minimap');
    await k.press('Tab'); await pc.page.waitForTimeout(100);
    check('Tab = Minimap (mở / đóng)', a6.mini && !(await st()).mini);
    await k.press('KeyH'); await pc.page.waitForTimeout(100);
    const a7 = await st();
    check('H = CombatMode: bật tự đánh (Disabled -> Enabled)', a7.auto && a7.mode === 'enabled', a7.mode);
    await k.press('KeyH');
    for (const [key, act] of [['KeyQ', 'slot2'], ['KeyE', 'slot3'], ['KeyR', 'slot4'], ['KeyC', 'switch'], ['KeyM', 'worldmap'], ['KeyI', 'inventory'], ['KeyB', 'slimeindex'], ['KeyN', 'slimeinventory'], ['KeyP', 'party'], ['Escape', 'escape']]) await k.press(key);   // J / K mở bảng thật (js/ui/story.js): kiểm riêng bên dưới
    await pc.page.waitForTimeout(150);
    const a8 = await pc.page.evaluate(() => WOS.log.slice(-40));
    const want = ['slot2', 'slot3', 'slot4', 'switch', 'worldmap', 'inventory', 'slimeindex', 'slimeinventory', 'party', 'escape'];
    check('Q E R C M I B N P Esc ra đúng hành động', want.every(w => a8.includes(w)), want.filter(w => !a8.includes(w)).join(',') || 'đủ 10');
    await k.press('KeyJ'); await pc.page.waitForTimeout(400);
    const mj = await pc.page.evaluate(() => WOS.state.modal); await k.press('Escape'); await pc.page.waitForTimeout(300);
    await k.press('KeyK'); await pc.page.waitForTimeout(400);
    const mk = await pc.page.evaluate(() => WOS.state.modal); await k.press('Escape'); await pc.page.waitForTimeout(300);
    check('J mở nhật ký nhiệm vụ, K mở Tiềm năng, Esc đóng', mj === 'questlog' && mk === 'perk' && !(await pc.page.evaluate(() => WOS.state.modal)), mj + ' ' + mk);
    // phím bịa cũ: T không huýt, giữ Shift không chạy
    const b0 = await st();
    await k.press('KeyT'); await pc.page.waitForTimeout(100);
    await k.down('KeyD'); await k.down('ShiftLeft'); await pc.page.waitForTimeout(700);
    const b1 = await st(); await k.up('ShiftLeft'); await k.up('KeyD');
    check('T không còn là phím gì', !(await pc.page.evaluate(() => WOS.log.slice(-20))).some(a => /whistle|return/.test(a)));
    check('giữ Shift + D: đi (Walk), không có clip Run', b1.anim === 'Walk' && b1.x !== b0.x, b1.anim);
    await pc.page.mouse.click(700, 300); await pc.page.waitForTimeout(120);
    check('chuột trái: đánh theo hướng chuột', (await st()).attacks > b1.attacks);
    // HUD trên đầu theo người chơi
    const tag = await pc.page.evaluate(() => { const r = document.querySelector('[data-hud="userHud"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom }; });
    check('tên người chơi ở gần giữa màn (theo đầu nhân vật)', Math.abs(tag.x - 640) < 200 && tag.y > 150 && tag.y < 450, Math.round(tag.x) + ',' + Math.round(tag.y));
    check('PC 720: ảnh ui/ không lỗi', pc.images.length > 40 && pc.images.every(s => s < 400), pc.images.length + ' ảnh');
    check('PC 720 không lỗi', !pc.problems.length, pc.problems.slice(0, 5).join(' | '));
    await pc.ctx.close();

    // ------------------------------------------------------------ PC 1920x1080
    console.log('PC 1920x1080');
    const hd = await open(browser, 'index.html', { viewport: { width: 1920, height: 1080 } }, { extra: 'quest&warn' });
    await ready(hd); await hd.page.waitForTimeout(1500);
    const r2 = await hudReport(hd.page, ['questItem', 'warning']);
    checkHud('PC 1080 (?quest&warn)', r2, { pc: true, more: ['questItem', 'warning'] });
    check('PC 1080: scale = 0.8', Math.abs(r2._s - 0.8) < 0.002, r2._s.toFixed(4));
    await shot(hd.page, 'pc_1920x1080');
    check('PC 1080 không lỗi', !hd.problems.length, hd.problems.slice(0, 5).join(' | '));
    await hd.ctx.close();

    // ------------------------------------------------------------ mobile 844x390
    console.log('mobile 844x390');
    const mo = await open(browser, 'mobile.html', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ready(mo); await mo.page.waitForTimeout(1500);
    const r3 = await hudReport(mo.page, ['questEmpty']);
    checkHud('mobile', r3, { pc: false, more: ['questEmpty'] });
    await shot(mo.page, 'mobile_844x390');
    const cdp = await mo.ctx.newCDPSession(mo.page);
    const center = sel => mo.page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    const tap = async (p, id = 3) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id }] }); await mo.page.waitForTimeout(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await mo.page.waitForTimeout(120); };
    const m0 = await mo.page.evaluate(() => ({ a: WOS.P.attacks, d: WOS.P.dashes }));
    await tap(await center('[data-hud="attack"]'));
    await tap(await center('[data-hud="dash"]'));
    const m1 = await mo.page.evaluate(() => ({ a: WOS.P.attacks, d: WOS.P.dashes, x: WOS.P.x }));
    check('mobile: nút đánh + nút lướt', m1.a === m0.a + 1 && m1.d === m0.d + 1, JSON.stringify(m1));
    const jc = await center('[data-hud="joystick"] .u');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jc.x, y: jc.y, id: 1 }] });
    for (let i = 1; i <= 15; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jc.x + Math.min(40, i * 4), y: jc.y, id: 1 }] }); await mo.page.waitForTimeout(80); }
    await shot(mo.page, 'mobile_844x390_drag');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mo.page.waitForTimeout(300);
    const m2 = await mo.page.evaluate(() => ({ x: WOS.P.x }));
    check('mobile: cần ảo đi sang phải', m2.x > m1.x + 1, m1.x.toFixed(2) + ' -> ' + m2.x.toFixed(2));
    check('mobile: ảnh ui/ không lỗi', mo.images.length > 40 && mo.images.every(s => s < 400), mo.images.length + ' ảnh');
    check('mobile không lỗi', !mo.problems.length, mo.problems.slice(0, 5).join(' | '));
    await mo.ctx.close();
  } finally {
    clearTimeout(kill);
    await browser.close();
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
