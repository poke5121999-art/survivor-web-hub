/*
 * Thế Giới Slime (games/world-of-slime) pha F5b: rà bản mobile (mobile.html 844x390, cảm ứng, deviceScaleFactor 2) qua mọi màn,
 * mở và đóng từng màn bằng CHẠM (không phím), chụp vào D:\wos-ref\proof\mobile\<màn>.png. Mỗi màn kiểm:
 *   - mở được bằng chạm, đóng được bằng chạm;
 *   - không phần tử nào (data-ui / data-hud / nút) đang hiện mà tràn ra ngoài màn (dung sai 2 px);
 *   - mọi nút chạm được (.btn, lựa chọn thoại, tab, ô chọn, nút popup) có cạnh ngắn >= 40 px CSS (MIN_TAP);
 *   - chữ không bị cắt (phần tử overflow hidden có scrollWidth/scrollHeight lớn hơn khung).
 * Màn: tiêu đề, đặt tên + xác nhận, tạo nhân vật, truyện tranh, ba lô, phim, Setting, thoại quán trọ (Amy), nhật ký nhiệm vụ,
 * Tiềm năng, Túi Đồ, quầy Vivian + popup Mua, Bách Khoa, Kho Slime (Allen), đấu tay đôi Rudga, chiến đấu + huýt sáo, kéo ném Cube.
 *
 *   py -3.12 -m http.server 8871 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8872 D:/world-of-slime-assets
 *   WOS_BASE=http://127.0.0.1:8871/games/world-of-slime/ WOS_ASSETS=http://127.0.0.1:8872/ node test/world-of-slime-mobile.js
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/mobile' : process.env.WOS_SHOTS;
const Q = s => '?seed=5' + (ASSETS ? '&assets=' + encodeURIComponent(ASSETS) : '') + s;
const MIN_TAP = 40;
const VIEW = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null && detail !== '' ? '  (' + detail + ')' : ''));
}
const wait = (page, ms) => page.waitForTimeout(ms);
async function until(page, fn, arg, ms = 10000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) { /* trang đang đổi */ } await wait(page, 100); }
  return false;
}
const center = (page, sel, i = 0) => page.evaluate(([sel, i]) => {
  const e = [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[i];
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [sel, i]);
async function tapSel(page, sel, i = 0, ms = 15000) {
  const t = Date.now(); let c = null;
  while (!c && Date.now() - t < ms) { c = await center(page, sel, i); if (!c) await wait(page, 150); }
  if (!c) return false;
  await page.touchscreen.tap(c.x, c.y); return true;
}
const modal = page => page.evaluate(() => window.WOS && WOS.story ? (WOS.story.modalStack || []).map(m => m.name).join(',') : '');

// đo một màn: tràn màn, nút nhỏ, chữ bị cắt. scope = bộ chọn gốc của màn (null = cả trang)
async function audit(page, name, scope) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  const r = await page.evaluate(([scope, MIN]) => {
    const W = innerWidth, H = innerHeight, over = [], small = [], clip = [], packed = [];
    const vis = e => {
      if (e.closest('[hidden]')) return false;
      for (let a = e; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
      }
      const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1;
    };
    const roots = scope ? [...document.querySelectorAll(scope)] : [document.body];
    const id = e => (e.dataset.ui || e.dataset.hud || e.dataset.act || e.className || e.tagName).toString().slice(0, 40);
    // phần tử thế giới (thẻ tên trên đầu NPC ngoài màn, bóng thoại) đi theo camera: không tính
    const skip = e => e.closest('[data-hud="world"], [data-hud="combatWorld"], .world');
    for (const root of roots) for (const e of root.querySelectorAll('[data-ui], [data-hud], .btn, [data-act]')) {
      if (skip(e) || !vis(e)) continue;
      const r = e.getBoundingClientRect();
      // phần tử bị cha có overflow hidden cắt mất (cuộn trong danh sách) thì đo phần nhìn thấy
      let L = r.left, T = r.top, R = r.right, B = r.bottom;
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a); if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom);
      }
      if (R - L < 1 || B - T < 1) continue;
      // npcPortrait: prefab DialogueUI neo x 0..0.35 + sizeDelta 400 nên khung tràn trái 200 đơn vị ở mọi tỉ lệ màn (gốc cũng vậy)
      if (e.dataset.hud === 'npcPortrait') continue;
      if (L < -2 || T < -2 || R > W + 2 || B > H + 2) over.push(id(e) + ' [' + [L, T, R, B].map(Math.round).join(',') + ']');
      // vùng chạm: chạm ở tâm và cách tâm 19 px theo 4 hướng (ô 38-40 px) đều phải trúng chính nút (hoặc con của nó). Bắt cả nút nhỏ
      // lẫn nút bị phần tử khác che. Chỉ xét nút thật (.btn, lựa chọn thoại), không xét con kế thừa cursor.
      const tappable = (e.classList.contains('btn') || e.dataset.hud === 'choice') && getComputedStyle(e).pointerEvents !== 'none';
      const clipped = Math.abs(L - r.left) + Math.abs(T - r.top) + Math.abs(R - r.right) + Math.abs(B - r.bottom) > 1;
      const cx = (L + R) / 2, cy = (T + B) / 2, h = (MIN - 2) / 2;
      const top = (x, y) => { const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)); };
      // nút bị bảng/popup đang mở che ở chính tâm: không chạm được là đúng (không phải nút nhỏ)
      if (tappable && !clipped && top(cx, cy)) {
        const miss = [[0, 0], [h, 0], [-h, 0], [0, h], [0, -h]].filter(([dx, dy]) => {
          const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) return false;
          const t = document.elementFromPoint(x, y); return !t || !(t === e || e.contains(t));
        });
        // điểm dò rơi vào NÚT KẾ BÊN (hàng nút sát nhau của prefab: -/+ của popup Mua, 3 ô nhanh trong Túi, ô đội trong Kho): tâm hai nút
        // cách nhau < 40 px nên không thể có 40 px riêng; ghi chú (packed), không tính lỗi. Rơi vào chữ/khung khác là lỗi.
        const other = miss.map(([dx, dy]) => document.elementFromPoint(cx + dx, cy + dy)).filter(t => t && !(t === e || e.contains(t)));
        if (other.length && other.every(t => t.closest('.btn, [data-hud="choice"]') && !t.closest('.btn, [data-hud="choice"]').contains(e))) { packed.push(id(e) + '~' + id(other[0].closest('.btn, [data-hud="choice"]'))); continue; }
        if (miss.length) { const t = document.elementFromPoint(cx + miss[0][0], cy + miss[0][1]); small.push(id(e) + ' ' + Math.round(R - L) + 'x' + Math.round(B - T) + (t ? ' ->' + id(t) : '')); }
      }
    }
    for (const root of roots) for (const e of root.querySelectorAll('*')) {
      if (skip(e) || !vis(e) || !e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(e);
      if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 3)) clip.push(e.textContent.trim().slice(0, 30));
    }
    return { over: [...new Set(over)], small: [...new Set(small)], clip: [...new Set(clip)], packed: [...new Set(packed)] };
  }, [scope, MIN_TAP]);
  check(name + ': không tràn màn', !r.over.length, r.over.slice(0, 6).join(' | '));
  check(name + ': vùng chạm nút >= ' + MIN_TAP + ' px', !r.small.length, r.small.slice(0, 8).join(' | '));
  check(name + ': chữ không bị cắt', !r.clip.length, r.clip.slice(0, 6).join(' | '));
  if (r.packed.length) console.log('    (hàng nút sát nhau theo prefab: ' + r.packed.slice(0, 6).join(' | ') + ')');
  return r;
}

async function open(browser, url, preset) {
  const ctx = await browser.newContext(VIEW);
  if (preset) await ctx.addInitScript(p => { if (!sessionStorage.getItem('wosPreset')) { sessionStorage.setItem('wosPreset', '1'); localStorage.setItem('wos.save', p); } }, JSON.stringify(preset));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  await page.goto(BASE + 'mobile.html' + Q(url));
  return { ctx, page, errs };
}
const ready = page => page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }).then(() => page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 30000 }).catch(() => {}));

// chạm qua hội thoại; pick(texts) trả chỉ số lựa chọn (mặc định 0). Dừng khi hội thoại đóng hoặc stop() đúng.
async function talk(page, pick, stopModal, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const s = await page.evaluate(() => { const d = WOS.story.dlg; return { dlg: !!d, choices: [...document.querySelectorAll('[data-hud="choiceText"]')].filter(e => e.getBoundingClientRect().width > 0).map(e => e.innerText), modal: (WOS.story.modalStack || []).map(m => m.name).join(',') }; });
    if (stopModal && new RegExp(stopModal).test(s.modal)) return true;
    if (!s.dlg && !stopModal) return true;
    if (s.choices.length) { const k = pick ? Math.max(0, pick(s.choices)) : 0; await tapSel(page, '[data-hud="choice"]', k, 2000); }
    else if (s.dlg) await tapSel(page, '[data-hud="dialogue"]', 0, 2000);
    await wait(page, 350);
  }
  return false;
}
// đứng gần NPC rồi chạm nút lớn (InteractAttack: có NPC trong tầm thì là nói chuyện)
async function interact(page) {
  for (let k = 0; k < 5; k++) {
    await tapSel(page, '[data-hud="attack"]');
    if (await until(page, () => !!WOS.story.dlg, null, 2500)) return true;
  }
  return false;
}
// đóng bảng đang mở bằng nút X (Btn_Square_04 của view())
async function closeTop(page, name) {
  const before = await modal(page);
  await tapSel(page, '[data-hud="close"]', await page.evaluate(() => document.querySelectorAll('[data-hud="close"]').length - 1));
  const ok = await until(page, n => !(WOS.story.modalStack || []).some(m => m.name === n), name, 4000);
  check(name + ': đóng bằng chạm nút X', ok, before + ' -> ' + await modal(page));
}

// bản lưu: q1..q6 xong, q7 đang làm, chưa thắng Rudga; 3 thuốc + 3 Cube
const PRESET = { v: 1, quests: { q1: { s: 'done', c: {} }, q2: { s: 'done', c: {} }, q3: { s: 'done', c: { heal: 1 } }, q4: { s: 'done', c: { herb: 1 } },
  q5: { s: 'done', c: { perk: 1 } }, q6: { s: 'done', c: {} }, q7: { s: 'active', c: {} } }, gold: 9911, exp: 10, level: 2, sp: 1,
  perks: { companion1: 1 }, items: { 1: 3, 4: 3 }, boxes: ['box_vivian'], slime: { hp: 1, mp: 1, st: 1 }, seen: {} };

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000);
  const allErrs = [];
  try {
    // ---- 1. mở đầu: bản lưu trống, chạm hết các màn
    console.log('mở đầu');
    let { ctx, page, errs } = await open(browser, '&fresh');
    await page.waitForSelector('[data-ui="title"][data-ready="1"]', { timeout: 60000 }); await wait(page, 600);
    await audit(page, 'title', '#intro');
    await page.touchscreen.tap(422, 300);
    check('tiêu đề -> đặt tên bằng chạm', await page.locator('[data-ui="nickInput"]').waitFor({ timeout: 20000 }).then(() => true, () => false));
    await wait(page, 800); await page.locator('[data-ui="nickInput"]').fill('TamSlime');
    await audit(page, 'nick', '#intro');
    await tapSel(page, '[data-ui="nickDone"]');
    await page.locator('[data-ui="nickConfirm"]').waitFor({ timeout: 5000 }); await wait(page, 300);
    await audit(page, 'nick_confirm', '#intro');
    await tapSel(page, '[data-ui="nickConfirm"] [data-ui="popupBtn"][data-v="true"]');
    await page.waitForFunction(() => { const c = document.querySelector('[data-ui="mirror"]'); return c && c.dataset.look; }, null, { timeout: 30000 });
    await wait(page, 1200);
    await audit(page, 'customize', '#intro');
    await tapSel(page, '[data-ui="tab"][data-k="hair"]'); await wait(page, 300);
    await tapSel(page, '[data-ui="opt"][data-v="2"]');
    check('tạo nhân vật: chạm tab Hair + ô 3', await until(page, () => JSON.parse(document.querySelector('[data-ui="mirror"]').dataset.look || '{}').hair === 2, null, 15000));
    await wait(page, 600); await audit(page, 'customize_hair', '#intro');
    await tapSel(page, '[data-ui="done"]');
    await page.locator('[data-ui="lookConfirm"]').waitFor({ timeout: 5000 }); await wait(page, 300);
    await audit(page, 'look_confirm', '#intro');
    await tapSel(page, '[data-ui="lookConfirm"] [data-ui="popupBtn"][data-v="true"]');
    await page.waitForFunction(() => window.WOS_INTRO && WOS_INTRO.stage === 'comic', null, { timeout: 15000 }); await wait(page, 1500);
    await audit(page, 'comic', '#intro');
    await tapSel(page, '[data-ui="skip"]');
    await page.waitForSelector('[data-ui="packCanvas"]', { timeout: 30000 }); await wait(page, 2500);
    await audit(page, 'pack', '#intro');
    await tapSel(page, '[data-ui="arrowR"]'); await wait(page, 1000);
    check('ba lô: chạm mũi tên phải -> vàng', await page.evaluate(() => document.querySelector('[data-ui="pack"]').dataset.focus) === 'yellow');
    await tapSel(page, '[data-ui="pickSelect"]');
    await page.waitForFunction(() => window.WOS_INTRO && WOS_INTRO.stage === 'film', null, { timeout: 15000 }); await wait(page, 1500);
    await audit(page, 'film', '#intro');
    await tapSel(page, '[data-ui="skip"]');
    await ready(page); await wait(page, 1500);
    await audit(page, 'game_inn', '#hud');
    // Setting từ nút menu
    await tapSel(page, '[data-hud="mainMenu"]');
    check('Setting mở bằng chạm nút menu', await until(page, () => WOS.state.modal === 'setting', null, 8000));
    await wait(page, 500); await audit(page, 'setting', '[data-stage="setting"]');
    for (const tab of ['Sound', 'Account']) { if (await tapSel(page, `[data-hud="${tab}"], [data-ui="${tab}"]`, 0, 2000)) { await wait(page, 300); await audit(page, 'setting_' + tab.toLowerCase(), '[data-stage="setting"]'); } }
    await tapSel(page, '[data-ui="settingClose"]');
    check('Setting đóng bằng chạm', await until(page, () => WOS.state.modal !== 'setting', null, 4000));
    allErrs.push(...errs); await ctx.close();

    // ---- 1b. thoại trong quán trọ (Amy, sau quầy): đứng sẵn trước quầy, chạm nút lớn
    ({ ctx, page, errs } = await open(browser, '&intro=0&map=257&at=26.7,25.9', PRESET));
    await ready(page); await wait(page, 1500);
    const amy = await interact(page);
    check('thoại Amy mở bằng chạm nút lớn', amy, JSON.stringify(await page.evaluate(() => ({ x: WOS.P.x, z: WOS.P.z }))));
    if (amy) { await wait(page, 900); await audit(page, 'dialogue_inn', 'body'); check('thoại Amy đóng bằng chạm', await talk(page, cs => cs.length - 1)); }
    allErrs.push(...errs); await ctx.close();

    // ---- 2. làng: nhật ký, Tiềm năng, Túi, quầy Vivian + Mua, Bách Khoa
    console.log('làng 110');
    ({ ctx, page, errs } = await open(browser, '&intro=0&map=110&at=33.4,69.2', PRESET));
    await ready(page); await wait(page, 1500);
    await audit(page, 'game_village', '#hud');
    await tapSel(page, '[data-hud="questItem"]');
    check('nhật ký mở bằng chạm thẻ nhiệm vụ', await until(page, () => (WOS.story.modalStack || []).some(m => m.name === 'questlog'), null, 4000), await modal(page));
    await wait(page, 500); await audit(page, 'questlog', '#hud, body > div');
    await closeTop(page, 'questlog');
    await tapSel(page, '[data-hud="playerInfo"]');
    check('Tiềm năng mở bằng chạm chân dung', await until(page, () => (WOS.story.modalStack || []).some(m => m.name === 'perk'), null, 4000), await modal(page));
    await wait(page, 500); await audit(page, 'perk', 'body');
    await closeTop(page, 'perk');
    await tapSel(page, '[data-hud="menuBag"]');
    check('Túi Đồ mở bằng chạm', await until(page, () => (WOS.story.modalStack || []).some(m => m.name === 'bag'), null, 4000), await modal(page));
    await wait(page, 600); await audit(page, 'bag', 'body');
    await closeTop(page, 'bag');
    const v = await interact(page);
    check('thoại Vivian mở bằng chạm', v);
    if (v) {
      await wait(page, 700); await audit(page, 'dialogue_vivian', 'body');
      const shop = await talk(page, cs => cs.findIndex(c => /Mua|Buy/i.test(c)), '^shop$|,shop$|shop');
      check('quầy mở bằng chạm lựa chọn Mua', shop, await modal(page));
      await wait(page, 600); await audit(page, 'shop', 'body');
      await tapSel(page, '[data-hud="shopBuy"]');
      check('popup Mua mở bằng chạm', await until(page, () => (WOS.story.modalStack || []).some(m => m.name === 'buyPopup'), null, 4000));
      await wait(page, 400); await audit(page, 'buy_popup', 'body');
      await tapSel(page, '[data-hud="buyCancel"]');
      check('popup Mua đóng bằng chạm Hủy', await until(page, () => !(WOS.story.modalStack || []).some(m => m.name === 'buyPopup'), null, 4000));
      await closeTop(page, 'shop');
      await until(page, () => !WOS.story.dlg, null, 3000);
    }
    // Bách Khoa: thêm một slime bắt được (trạng thái), mở bằng chạm nút Index
    await page.evaluate(() => WOS.roster.add('SL_Slime_Grass', { acquisition: 'TAME' }));
    await until(page, () => !document.querySelector('[data-hud="menuIndex"]').hidden, null, 3000);
    await tapSel(page, '[data-hud="menuIndex"]');
    check('Bách Khoa mở bằng chạm', await until(page, () => (WOS.story.modalStack || []).some(m => m.name === 'dex'), null, 4000), await modal(page));
    await wait(page, 800); await audit(page, 'dex', 'body');
    await closeTop(page, 'dex');
    allErrs.push(...errs); await ctx.close();

    // ---- 3. kho Allen (478)
    console.log('kho 478');
    ({ ctx, page, errs } = await open(browser, '&intro=0&map=478&at=32.5,37.6', PRESET));
    await ready(page); await wait(page, 1500);
    await page.evaluate(() => WOS.roster.add('SL_Slime_Grass', { acquisition: 'TAME' }));
    const al = await interact(page);
    check('thoại Allen mở bằng chạm', al);
    if (al) {
      const stg = await talk(page, cs => cs.findIndex(c => /Kho|Storage/i.test(c)), 'storage');
      check('Kho Slime mở bằng chạm lựa chọn', stg, await modal(page));
      await wait(page, 800); await audit(page, 'storage', 'body');
      await closeTop(page, 'storage');
    }
    allErrs.push(...errs); await ctx.close();

    // ---- 4. đấu tay đôi: đứng ngay cổng tây, kéo cần ảo sang trái
    console.log('đấu tay đôi');
    ({ ctx, page, errs } = await open(browser, '&intro=0&map=110&at=26.6,58.5', PRESET));
    await ready(page); await wait(page, 1200);
    {
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 4 }] });
      await touch('touchStart', 150, 290); for (let k = 1; k <= 4; k++) { await touch('touchMove', 150 - 15 * k, 290); await wait(page, 30); }
      const ru = await until(page, () => WOS.story.dlg && WOS.story.dlg.D.root.dataset.speaker === 'Rudga', null, 6000);
      await touch('touchEnd');
      check('Rudga chặn cổng (cần ảo)', ru);
      await wait(page, 600); await audit(page, 'dialogue_rudga', 'body');
      await talk(page, null, null, 30000);
      const vs = await until(page, () => !!document.querySelector('[data-hud="pvpVs"]') && document.querySelector('[data-hud="pvpVs"]').getBoundingClientRect().width > 0, null, 15000);
      check('vào sân đấu', vs);
      await wait(page, 400); await audit(page, 'duel_vs', '#hud');
      await until(page, () => WOS.state.battle, null, 15000); await wait(page, 1500);
      await audit(page, 'duel_fight', '#hud');
    }
    allErrs.push(...errs); await ctx.close();

    // ---- 5. rừng: đánh + huýt sáo, kéo ném Cube
    console.log('rừng');
    ({ ctx, page, errs } = await open(browser, '&intro=0&map=shadow_forest_entrance&at=72,33', { ...PRESET, duel: true }));
    await ready(page); await wait(page, 1500);
    await tapSel(page, '[data-hud="attack"]');
    const bt = await until(page, () => WOS.state.battle, null, 8000);
    check('chạm nút đánh -> vào trận', bt);
    await wait(page, 1200); await audit(page, 'combat', '#hud');
    await tapSel(page, '[data-hud="attack"]');
    check('chạm nút huýt sáo -> gọi slime về', await until(page, () => !WOS.state.battle || WOS.combat.events.some(e => e.kind === 'recall'), null, 6000));
    await wait(page, 600); await audit(page, 'combat_whistle', '#hud');
    {
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 5 }] });
      const k = await page.evaluate(() => (WOS.quest.save.quick || []).indexOf(4));
      const btn = await center(page, `[data-hud="item${Math.max(0, k)}"]`);
      check('ô Cube có trên HUD', !!btn, k);
      if (btn) {
        await touch('touchStart', btn.x, btn.y); await wait(page, 80);
        for (let j = 1; j <= 6; j++) { await touch('touchMove', btn.x - 12 * j, btn.y - 8 * j); await wait(page, 40); }
        const ring = await page.evaluate(() => WOS.tame.ring.visible);
        check('kéo ô Cube hiện vòng ngắm', ring);
        await audit(page, 'tame_aim', '#hud');
        await touch('touchEnd');
        check('thả = ném Cube', await until(page, () => WOS.combat.events.some(e => e.kind === 'cubeThrow') || (WOS.quest.events || []).some(e => e.kind === 'cubeThrow'), null, 3000));
        await wait(page, 1500); await audit(page, 'tame_throw', '#hud');
      }
    }
    allErrs.push(...errs); await ctx.close();
  } catch (e) {
    check('chạy hết không ngoại lệ', false, e.message.split('\n')[0]);
  }
  const errs = allErrs.filter(e => !/AudioContext|autoplay/i.test(e));
  check('không lỗi trang / console / HTTP', !errs.length, errs.slice(0, 5).join(' | '));
  clearTimeout(kill); await browser.close();
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
