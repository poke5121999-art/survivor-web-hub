/*
 * Kiểm phím báo lỗi F9 (js/feedback-capture.js) trên game thật: bấm F9 (hoặc chạm nút máy ảnh ở chế độ điện thoại),
 * ảnh chụp không trắng, log có dòng console, gõ trong ngăn không lọt phím vào game, gửi phiếu thật lên Supabase,
 * rồi mở feedback-admin.html xem log của phiếu ấy và xoá phiếu thử.
 *
 * Dùng:  FBCAP_BASE=https://poke5121999-art.github.io/survivor-web-hub FBCAP_KEY=<khoá triage> FBCAP_OUT=<thư mục> \
 *          node test/feedback-capture.js [game ...]
 *        game dạng <id> (games/<id>/index.html) hoặc URL đầy đủ; thêm "@phone" để chạy cỡ điện thoại 2756x1268 DPR 3.
 *        PLAYWRIGHT_PATH, CHROME_PATH ghi đè đường dẫn. Không có FBCAP_KEY thì không vào admin và không xoá phiếu.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const BASE = (process.env.FBCAP_BASE || 'https://poke5121999-art.github.io/survivor-web-hub').replace(/\/+$/, '');
const OUT = process.env.FBCAP_OUT || path.join(__dirname, 'shots', 'feedback-capture');
const KEY = process.env.FBCAP_KEY || '';
const WAIT = Number(process.env.FBCAP_WAIT || 8000);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

// Đọc trong shadow root của ngăn báo lỗi.
function inPanel(page, fn, arg) {
  return page.evaluate(([src, a]) => {
    const host = document.getElementById('hub-feedback-capture');
    const root = host && host.shadowRoot;
    return root ? new Function('root', 'arg', src)(root, a) : null;
  }, [fn, arg]);
}

async function imageStats(page, url) {
  return page.evaluate(async (u) => {
    const blob = await (await fetch(u)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    const colors = new Set();
    let sum = 0, sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      colors.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += l; sum2 += l * l;
    }
    const n = d.length / 4, mean = sum / n;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { w: bmp.width, h: bmp.height, type: blob.type, bytes: blob.size, colors: colors.size, mean: Math.round(mean), sd: Math.round(Math.sqrt(sum2 / n - mean * mean)), b64: btoa(bin) };
  }, url);
}

async function runGame(br, spec, made) {
  const phone = /@phone$/.test(spec);
  const id = spec.replace(/@phone$/, '');
  const url = /^https?:/.test(id) ? id : BASE + '/games/' + id + '/index.html';
  const tag = (id.match(/games\/([a-z0-9-]+)/) || [null, id])[1] + (phone ? '-phone' : '');
  console.log('\n' + tag + '  ' + url);
  const ctx = await br.newContext(phone
    ? { viewport: { width: 919, height: 423 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; 2507FPN8EG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' }
    : { viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', name: 'fbcap-test' }));
    localStorage.setItem('hub.lang', 'vi');
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(WAIT);
    const kit = await page.evaluate(() => window.__hubCapture && window.__hubCapture.version);
    check(tag + ': kit nạp', !!kit, kit);
    if (!kit) return;
    await page.evaluate(() => {
      console.log('FBCAP-MARK console line', { at: Date.now() });
      console.warn('FBCAP-MARK warn');
      window.hubFeedbackState = () => ({ fbcapTest: true, level: 3 });
      window.__leak = 0;
      const count = (e) => { if (!/^F9$/.test(e.key)) window.__leak++; };
      window.addEventListener('keydown', count, true);
      document.addEventListener('keydown', count);
    });
    // Mở bằng phím F9 (máy tính) hoặc chạm nút máy ảnh (điện thoại).
    if (phone) {
      const box = await inPanel(page, 'const r = root.querySelector(".cam").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };');
      check(tag + ': có nút máy ảnh', box && box.w > 20, box && JSON.stringify(box));
      await page.touchscreen.tap(box.x, box.y);
    } else {
      await page.keyboard.press('F9');
    }
    await page.waitForFunction(() => {
      const r = document.getElementById('hub-feedback-capture').shadowRoot;
      const img = r.querySelector('.shot img');
      return !r.querySelector('.panel').hidden && (!img.hidden || r.querySelector('.msg').textContent);
    }, null, { timeout: 90000 });
    const info = await inPanel(page, 'const p = root.querySelector(".panel"); const r = p.getBoundingClientRect(); return { cls: p.className, x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), img: root.querySelector(".shot img").src, msg: root.querySelector(".msg").textContent, sum: root.querySelector(".sum").textContent };');
    check(tag + ': ngăn mở cạnh game', info.cls.indexOf(phone ? 'side' : 'side') >= 0 && info.w < (phone ? 919 : 1366) * 0.5, info.cls + ' ' + info.w + 'x' + info.h + ' ' + info.sum);
    const log = await page.evaluate(() => window.__hubCapture.lastLog());
    const st = await imageStats(page, info.img);
    fs.writeFileSync(path.join(OUT, tag + '-capture.' + (st.type === 'image/webp' ? 'webp' : 'jpg')), Buffer.from(st.b64, 'base64'));
    await page.screenshot({ path: path.join(OUT, tag + '-panel.png') });
    check(tag + ': ảnh chụp không trắng', st.colors > 12 && st.sd > 6, `${st.w}x${st.h} ${st.type} ${st.bytes}B màu=${st.colors} sd=${st.sd} cách=${log.capture && log.capture.how} ${log.capture && log.capture.ms}ms`);
    const gl = log.canvases.filter((c) => /webgl/.test(c.ctx));
    console.log('     canvas: ' + JSON.stringify(log.canvases));
    if (gl.length) check(tag + ': canvas WebGL chụp được', gl.every((c) => c.grabbed && !c.blank));
    check(tag + ': log có dòng console', log.console.some((c) => /FBCAP-MARK console line/.test(c.m)) && log.console.some((c) => c.l === 'warn'), log.console.length + ' dòng, ' + log.errors.length + ' lỗi, fps ' + log.perf.fps);
    check(tag + ': log có state của game', log.state && log.state.fbcapTest === true);
    check(tag + ': log có game id + người chơi', log.game.id && log.user && log.user.name === 'fbcap-test', log.game.id + ' rev ' + log.game.rev);

    // Gõ trong ngăn: phím không được lọt vào listener của game.
    await inPanel(page, 'root.querySelector("input[name=title]").focus(); return 1;');
    await page.keyboard.type('[TEST] fbcap ' + tag + ' wasd');
    await inPanel(page, 'root.querySelector("textarea").focus(); return 1;');
    await page.keyboard.type('Phiếu thử tự động của test/feedback-capture.js, sẽ xoá.');
    const typed = await inPanel(page, 'return root.querySelector("input[name=title]").value;');
    const leak = await page.evaluate(() => window.__leak);
    check(tag + ': gõ trong ngăn không lọt phím vào game', leak === 0 && /wasd$/.test(typed), 'lọt ' + leak + ', ô: ' + typed);

    await inPanel(page, 'root.querySelector(".send").click(); return 1;');
    await page.waitForFunction(() => window.__hubCapture.lastTicket || /không được/.test(document.getElementById('hub-feedback-capture').shadowRoot.querySelector('.msg').textContent), null, { timeout: 60000 });
    const ticket = await page.evaluate(() => window.__hubCapture.lastTicket);
    const msg = await inPanel(page, 'return root.querySelector(".msg").textContent;');
    check(tag + ': gửi phiếu', !!ticket, msg);
    if (ticket) made.push({ id: ticket, tag, mark: 'FBCAP-MARK' });

    // Esc đóng ngăn.
    await page.waitForFunction(() => document.getElementById('hub-feedback-capture').shadowRoot.querySelector('.panel').hidden, null, { timeout: 10000 });
    await page.keyboard.press('F9');
    await page.waitForFunction(() => !document.getElementById('hub-feedback-capture').shadowRoot.querySelector('.panel').hidden, null, { timeout: 90000 });
    await inPanel(page, 'root.querySelector("input[name=title]").focus(); return 1;');
    await page.keyboard.press('Escape');
    const closed = await inPanel(page, 'return root.querySelector(".panel").hidden;');
    check(tag + ': Esc đóng ngăn', closed === true);
    if (pageErrors.length) console.log('     pageerror (của game): ' + pageErrors.slice(0, 3).join(' | '));
  } catch (e) {
    const dbg = await page.evaluate(() => { const r = document.getElementById('hub-feedback-capture'); const s = r && r.shadowRoot; return s ? { panelHidden: s.querySelector('.panel').hidden, msg: s.querySelector('.msg').textContent, img: !s.querySelector('.shot img').hidden, ticket: window.__hubCapture.lastTicket } : null; }).catch(() => null);
    check(tag + ': chạy hết kịch bản', false, e.message.split('\n')[0] + ' ' + JSON.stringify(dbg));
    await page.screenshot({ path: path.join(OUT, tag + '-error.png') }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

async function admin(br, made) {
  console.log('\nfeedback-admin.html');
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((k) => { localStorage.setItem('hub.feedback.key', k); localStorage.setItem('hub.feedback.lang', 'vi'); }, KEY);
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + '/feedback-admin.html', { waitUntil: 'load' });
    await page.waitForSelector('#fa-board:not([hidden])', { timeout: 30000 });
    for (const m of made) {
      await page.fill('#fa-search', '#' + m.id);
      const li = page.locator('li[data-id="' + m.id + '"]');
      await li.waitFor({ timeout: 15000 });
      await li.locator('summary').click();
      await li.locator('.fa-log__toggle').click();
      await li.locator('.fa-log__view').waitFor({ timeout: 20000 });
      const text = await li.locator('.fa-log__view').innerText();
      const shots = await li.locator('.fb-item__shots img').count();
      await li.screenshot({ path: path.join(OUT, 'admin-' + m.tag + '.png') });
      check('admin #' + m.id + ' (' + m.tag + '): thấy ảnh + log', shots === 1 && text.indexOf(m.mark) >= 0 && /fbcapTest/.test(text), 'ảnh ' + shots);
    }
  } catch (e) {
    check('admin: chạy hết kịch bản', false, e.message.split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, 'admin-error.png') }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

async function cleanup(made) {
  const src = await (await fetch(BASE + '/js/supabase-config.js')).text();
  const url = /url:\s*"([^"]+)"/.exec(src)[1].replace(/\/+$/, '');
  const anon = /anonKey:\s*"([^"]+)"/.exec(src)[1];
  for (const m of made) {
    const res = await fetch(url + '/rest/v1/rpc/fb_delete', {
      method: 'POST',
      headers: { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: m.id, p_key: KEY })
    });
    check('xoá phiếu thử #' + m.id, res.ok, res.status);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, '.ran'), String(Date.now()));
  const games = process.argv.slice(2);
  if (!games.length) games.push('ga-chim', 'battle-cats', 'gia-pha', 'battle-cats@phone');
  const { chromium } = require(PW);
  const br = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const made = [];
  try {
    for (const g of games) await runGame(br, g, made);
    if (KEY && made.length) await admin(br, made);
  } finally {
    await br.close();
    if (KEY && made.length && !process.env.FBCAP_KEEP) await cleanup(made);
  }
  console.log(`\n${pass} PASS, ${fail} FAIL  · ảnh: ${OUT}`);
  process.exit(fail ? 1 : 0);
})();
