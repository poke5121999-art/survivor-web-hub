/*
 * Thế Giới Slime (games/world-of-slime) — lát cắt đầu: đi bộ trên PC (phím gốc WASD/LShift/Space) và mobile (kéo cần ảo),
 * kiểm người chơi có đi, có leo cầu thang, không có lỗi trang / console / HTTP >= 400.
 *
 * Chạy cục bộ (gốc repo + repo asset, asset cần header CORS):
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1                                   (ở gốc repo)
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   WOS_ASSETS=http://127.0.0.1:8842/ node test/world-of-slime-slice.js
 * Chạy trên Pages:
 *   WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-slice.js
 * Biến: WOS_BASE (mặc định http://127.0.0.1:8841/games/world-of-slime/), WOS_ASSETS (rỗng = gốc asset mặc định của
 * game, tức Pages), WOS_SHOTS (thư mục ảnh, mặc định D:/wos-ref/proof/slice; "" = không chụp).
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/slice' : process.env.WOS_SHOTS;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

async function open(browser, file, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  const q = ASSETS ? '?assets=' + encodeURIComponent(ASSETS) : '';
  const t0 = Date.now();
  await page.goto(BASE + file + q);
  await page.waitForFunction(() => window.__ready || (window.__wosErrors || []).length, null, { timeout: 120000 });
  const loadS = (Date.now() - t0) / 1000;
  await page.waitForTimeout(1200);
  return { ctx, page, problems, loadS };
}
const state = page => page.evaluate(() => ({ x: WOS.P.x, z: WOS.P.z, y: WOS.P.y, dist: WOS.stats.dist, fps: WOS.stats.fps,
  errors: WOS.errors.slice(), slime: { x: WOS.S.x, z: WOS.S.z }, anim: WOS.player.cur, sanim: WOS.slime.cur,
  steps: WOS.audio.played, audio: WOS.audio.log.slice(-3), dev: !document.getElementById('devlabel').hidden }));
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    // ------------------------------------------------------------ PC 1280x720, phím
    console.log('PC (index.html, 1280x720)');
    const pc = await open(browser, 'index.html', { viewport: { width: 1280, height: 720 } });
    const k = pc.page.keyboard;
    const s0 = await state(pc.page);
    check('nhãn "bản đồ thử" hiện', s0.dev);
    await shot(pc.page, 'pc_0_start');
    // đông theo đường đất (giữa chừng nhấn LShift = lướt, bảng phím gốc), tới x 33, rồi lên bắc qua cầu thang lên cao nguyên
    await k.down('KeyD'); await pc.page.waitForTimeout(1200);
    const sMid = await state(pc.page); await shot(pc.page, 'pc_1_walk');
    await pc.page.waitForTimeout(1300);
    // chạy tới cột cầu thang (x 31.5..35.5 của bản đồ thử) rồi mới rẽ bắc
    // chờ theo vị trí chứ không theo giờ: máy chung tải nặng thì khung hình chậm (dt bị kẹp 0.05 s)
    const d0 = await pc.page.evaluate(() => WOS.P.dashes);
    await k.press('ShiftLeft'); await pc.page.waitForTimeout(150); const sRun = await state(pc.page);
    sRun.dashed = (await pc.page.evaluate(() => WOS.P.dashes)) - d0;
    await pc.page.waitForFunction(() => WOS.P.x >= 33, null, { timeout: 12000 }).catch(() => {});
    await k.up('KeyD'); await k.down('KeyW');
    await pc.page.waitForTimeout(1200);
    await pc.page.waitForFunction(() => WOS.P.z >= 18.3, null, { timeout: 4000 }).catch(() => {});
    await k.up('KeyW');
    await pc.page.waitForTimeout(700);
    const s1 = await state(pc.page);
    await shot(pc.page, 'pc_2_stair');
    await k.press('Space'); await pc.page.waitForTimeout(250); await shot(pc.page, 'pc_3_attack');
    const sA = await state(pc.page);
    check('đi được > 8 m', s1.dist > 8, s1.dist.toFixed(2) + ' m');
    console.log('  giữa: (' + sMid.x.toFixed(1) + ', ' + sMid.z.toFixed(1) + ') chạy: (' + sRun.x.toFixed(1) + ', ' + sRun.z.toFixed(1) + ') cuối: (' + s1.x.toFixed(1) + ', ' + s1.z.toFixed(1) + ')');
    check('đang đi thì chạy clip Walk', sMid.anim === 'Walk', sMid.anim);
    check('LShift = lướt (Dash), không có Shift-chạy', sRun.dashed === 1 && sRun.anim !== 'Run', 'dash ' + sRun.dashed + ', ' + sRun.anim);
    check('leo cầu thang: độ cao tăng', s1.y > s0.y + 1, s0.y.toFixed(2) + ' -> ' + s1.y.toFixed(2));
    check('slime theo kịp (< 4 m)', Math.hypot(s1.slime.x - s1.x, s1.slime.z - s1.z) < 4,
      Math.hypot(s1.slime.x - s1.x, s1.slime.z - s1.z).toFixed(2) + ' m');
    check('Space: clip đánh', sA.anim === 'SlimeAttack' || sA.sanim === 'Attack', sA.anim + '/' + sA.sanim);
    check('có tiếng bước chân', s1.steps > 0, s1.steps + ' lần; ' + JSON.stringify(s1.audio));
    console.log('  fps PC: ' + s1.fps + ', tải ' + pc.loadS.toFixed(1) + ' s');
    check('PC không lỗi', !pc.problems.length && !s1.errors.length, [...pc.problems, ...s1.errors].slice(0, 5).join(' | '));
    await pc.ctx.close();

    // ------------------------------------------------------------ mobile 844x390 cảm ứng, kéo cần ảo
    console.log('mobile (mobile.html, 844x390 touch)');
    const mo = await open(browser, 'mobile.html', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const m0 = await state(mo.page);
    await shot(mo.page, 'mobile_0_start');
    const cdp = await mo.ctx.newCDPSession(mo.page);
    const c = await mo.page.evaluate(() => { const r = document.querySelector('[data-hud="joystick"] .u').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', c.x, c.y);
    for (let i = 1; i <= 50; i++) {                      // 5 s: kéo sang phải rồi chéo lên
      const a = i < 25 ? 0 : -Math.PI / 4, r = Math.min(40, i * 5);
      await touch('touchMove', c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
      if (i === 20) await shot(mo.page, 'mobile_1_drag');
      await mo.page.waitForTimeout(100);
    }
    await touch('touchEnd');
    await mo.page.waitForTimeout(600);
    const m1 = await state(mo.page);
    await shot(mo.page, 'mobile_2_end');
    const btn = await mo.page.evaluate(() => { const r = document.querySelector('[data-hud="attack"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: btn.x, y: btn.y, id: 2 }] });
    await mo.page.waitForTimeout(120);
    const mA = await state(mo.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('cần ảo: đi được > 6 m', m1.dist > 6, m1.dist.toFixed(2) + ' m');
    check('cần ảo: đi sang phải (+x)', m1.x > m0.x + 3, m0.x.toFixed(2) + ' -> ' + m1.x.toFixed(2));
    check('nút đánh: clip đánh', mA.anim === 'SlimeAttack' || mA.sanim === 'Attack', mA.anim + '/' + mA.sanim);
    console.log('  fps mobile: ' + m1.fps + ', tải ' + mo.loadS.toFixed(1) + ' s, cuối ở (' + m1.x.toFixed(1) + ', ' + m1.z.toFixed(1) + ', y ' + m1.y.toFixed(1) + ')');
    check('mobile không lỗi', !mo.problems.length && !m1.errors.length, [...mo.problems, ...m1.errors].slice(0, 5).join(' | '));
    await mo.ctx.close();
  } finally {
    clearTimeout(kill);
    await browser.close();
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
