/*
 * Chợ Phiên (games/bazaar) — kiểm trang xem trận trên trình duyệt thật (Playwright).
 *
 * Chạy:  node test/bazaar-view.js
 *        BZ_URL=https://poke5121999-art.github.io/survivor-web-hub node test/bazaar-view.js   (chạy trên Pages)
 * Không có BZ_URL thì tự dựng máy chủ tĩnh ở gốc repo (cổng ngẫu nhiên) và tắt khi xong.
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/bazaar-view): giữa trận, tooltip, kết quả, điện thoại 844×390 — mở ra xem bằng mắt
 * cạnh D:\bazaar-ref\shots\wiki\dooley-friends-1.jpg.
 *
 * Điều kiểm (kỳ vọng ghi thẳng bằng số/chuỗi):
 *  1. Trang nạp: 0 pageerror, 0 console error, 0 phản hồi HTTP ≥ 400.
 *  2. Trận cố định Flame Juggler (bàn dưới) đấu Gorgon Noble (bàn trên), seed 7: người thắng + endMs trên trang = BZSim.run trong Node.
 *  3. Phát lại ở 3×: số "số bay" chính = số sự kiện damage/heal/shield có amt > 0; số đạn = số sự kiện đó có thẻ nguồn
 *     (damage kind Damage, heal không phải Regen, shield).
 *  4. Rê chuột lên thẻ: tooltip hiện, có số đã giải, không còn "{ability".
 *  5. Thời gian xử lý mỗi khung ở 1280×720 trung bình < 16 ms (in ra cả khoảng cách giữa hai khung).
 *  6. Sau cú nhấp đầu (mở khoá âm thanh) có tiếng phát ra, không tệp tiếng nào thiếu.
 *  7. (P0 review VFX) khựng hình: một lần ≤ 250 ms, trận Infernal Envoy đấu Training Dummy (sát thương thừa 15 vào 2 máu) không đứng hình
 *     > 400 ms; mọi lần khựng trùng lúc một đòn Damage chạm (bỏng/độc/bão cát không khựng).
 *  8. (P0) blend cộng trên canvas trong suốt: vẽ đạn của 12 ActionType mặc định + chớp trúng hồi máu/hồi phục/khiên, đọc điểm ảnh canvas:
 *     0 điểm "tối mà đặc" (alpha > 0,7, max RGB < 40) — trước đây khiên là ô vuông đen, hồi máu là ô xám; FX_Star_01_T đã nướng alpha.
 *  9. (P0) khung khiên/nộ: có bật giữa trận, tắt khi trận ngã ngũ, BZView.clearCards() (ui/combat.js dỡ trận) gỡ sạch.
 * 10. (MOBILE P0) tooltip ở 844×390: chữ dòng hiệu ứng ≥ 12 px thật.
 * Chromium chạy có GPU (cờ ANGLE d3d11); BZ_SOFT=1 để chạy dựng hình phần mềm (khung chậm hơn nhiều, chỉ số xử lý JS không đổi).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bazaar-view');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.skel': 'application/octet-stream', '.atlas': 'text/plain' };
// data/frames.js do luồng khác sinh: chưa có trên đĩa thì 404 của nó không tính là lỗi (trang tự dùng khung CSS).
const OPTIONAL = fs.existsSync(path.join(ROOT, 'games/bazaar/data/frames.js')) ? [] : ['/games/bazaar/data/frames.js'];
const optional = url => OPTIONAL.some(f => url.split('?')[0].endsWith(f));

// ---------- Node: chạy cùng trận để so ----------
globalThis.window = globalThis;
['cards', 'monsters', 'mode'].forEach(f => require(path.join(ROOT, 'games/bazaar/data', f + '.js')));
const BZ = require(path.join(ROOT, 'games/bazaar/js/sim/index.js'));
const MA = globalThis.BZ_MONSTERS.find(m => m.InternalName === 'Flame Juggler');
const MB = globalThis.BZ_MONSTERS.find(m => m.InternalName === 'Gorgon Noble');
const SEED = 7;
const NODE = BZ.run({ boards: [BZ.boardFromMonster(MA, 'a'), BZ.boardFromMonster(MB, 'b')], seed: SEED, sandstorm: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = (m.location() || {}).url || '';
    if (optional(url)) return;
    errors.push('console: ' + m.text());
  });
  page.on('response', r => { if (r.status() >= 400 && !optional(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
async function ready(page) {
  await page.waitForFunction(() => window.BZ_READY === true && window.BZ_DEBUG && window.BZ_DEBUG.state(), null, { timeout: 60000 });
}

async function desktop(browser, base) {
  out.push('\n[1280x720]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  const url = base + '/games/bazaar/index.html?a=' + MA.Id.slice(0, 8) + '&b=' + MB.Id.slice(0, 8) + '&seed=' + SEED + '&speed=1';
  await page.goto(url, { waitUntil: 'load' });
  await ready(page);
  await sleep(600);
  const st0 = await page.evaluate(() => window.BZ_DEBUG.state());
  check('trận trên trang cùng người thắng với Node (' + NODE.winner + ')', st0.winner === NODE.winner, 'trang ' + st0.winner);
  check('trận trên trang cùng endMs với Node (' + NODE.endMs + ')', st0.endMs === NODE.endMs, 'trang ' + st0.endMs);
  check('khung 2D data/frames.js đã nạp', st0.frames === true || OPTIONAL.length > 0, 'frames=' + st0.frames);

  // tooltip: rê chuột thật lên thẻ đầu tiên của bàn dưới
  const uid = await page.evaluate(() => window.BZ_DEBUG.cardUids().find(u => /^a-/.test(u)));
  const box = await page.locator('.bz-card[data-uid="' + uid + '"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height * 0.35, { steps: 4 });
  await sleep(350);
  const tip = await page.evaluate(() => { const t = document.querySelector('.bz-tip'); return t ? { show: t.classList.contains('show'), text: t.innerText } : null; });
  check('tooltip hiện khi rê chuột lên thẻ', !!tip && tip.show, tip ? tip.text.slice(0, 80).replace(/\n/g, ' | ') : 'không có .bz-tip');
  check('tooltip có số đã giải và không còn "{ability"', !!tip && /\d/.test(tip.text) && !/\{ability|\{aura/.test(tip.text), tip ? tip.text.replace(/\n/g, ' | ').slice(0, 160) : '');
  await page.screenshot({ path: path.join(SHOTS, 'tooltip-1280.png') });
  await page.mouse.move(5, 5);

  // cú nhấp đầu: mở khoá AudioContext (chính sách autoplay), rồi phát lại 3× từ đầu, đo hiệu năng, chụp giữa trận
  await page.mouse.click(640, 700);
  await page.evaluate(seed => { window.BZ_DEBUG.fight(window.BZ_DEBUG.state().a, window.BZ_DEBUG.state().b, seed); window.BZ_DEBUG.speed(3); window.BZ_DEBUG.resetPerf(); }, SEED);
  const end = NODE.endMs;
  let shotMid = false, t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const s = await page.evaluate(() => window.BZ_DEBUG.state());
    if (!shotMid && s.t >= end * 0.45) {
      shotMid = true;
      await page.screenshot({ path: path.join(SHOTS, 'mid-1280.png') });
    }
    if (s.done) break;
    await sleep(120);
  }
  const st = await page.evaluate(() => window.BZ_DEBUG.state());
  const perf = await page.evaluate(() => window.BZ_DEBUG.perf());
  const evs = await page.evaluate(() => window.BZ_DEBUG.events());
  const main = evs.filter(e => (e.type === 'damage' || e.type === 'heal' || e.type === 'shield') && e.amt > 0);
  // hồi 0 máu (đầy máu) không còn bắn đạn (VFX-24)
  const withSrc = evs.filter(e => e.src != null && ((e.type === 'damage' && e.kind === 'Damage') || (e.type === 'heal' && e.kind !== 'Regen' && e.amt > 0) || (e.type === 'shield' && e.amt > 0)));
  check('phát lại 3× chạy tới hết', st.done === true, 't=' + Math.round(st.t) + '/' + st.duration);
  check('số bay chính = ' + main.length + ' sự kiện damage/heal/shield (amt > 0)', st.fx.numbers === main.length, 'đã bay ' + st.fx.numbers + ', phụ ' + st.fx.numbersAux);
  check('số đạn = ' + withSrc.length + ' sự kiện damage/heal/shield có thẻ nguồn', st.fx.projectiles === withSrc.length, 'đã bắn ' + st.fx.projectiles);
  check('mọi sự kiện đã được phát (' + evs.length + ')', st.dispatched === evs.length, 'đã phát ' + st.dispatched);
  check('có tiếng phát ra sau cú nhấp, 0 tệp tiếng thiếu', st.audio && st.audio.played > 0 && st.audio.missing === 0, JSON.stringify(st.audio));
  check('thời gian xử lý khung trung bình < 16 ms ở 1280×720', perf.avgWorkMs < 16,
    'xử lý TB ' + perf.avgWorkMs.toFixed(2) + ' ms, max ' + perf.maxWorkMs.toFixed(1) + ' ms, khung TB ' + perf.avgFrameMs.toFixed(2) + ' ms, ' + perf.frames + ' khung');
  await sleep(500);
  const bannerOf = () => page.evaluate(() => { const b = document.querySelector('.bz-banner'); return { cls: b.className, h: b.querySelector('h2').textContent, op: getComputedStyle(b).opacity }; });
  const want = NODE.winner === 'draw' ? 'HOÀ' : NODE.winner === 0 ? 'CHIẾN THẮNG' : 'THẤT BẠI'; // bàn 0 = phe ta (dưới)
  // băng-rôn giữ ~1,5 s (clip heZSYG0dD_c ?t=1828) rồi mờ đi: cuối trận (3,2 s sau) đã không còn hiện
  const bEnd = await bannerOf();
  check('băng-rôn kết quả đã mờ sau thời gian giữ (~1,5 s), không treo tới hết trận', !/show/.test(bEnd.cls), bEnd.cls + ' op=' + bEnd.op);
  // Dừng phát rồi mới tua: trước đây tua xong chờ 150 ms ở 3×, máy chậm (chạy trên Pages) trôi quá 1,5 s giữ → trượt chập chờn
  await page.evaluate(ms => { window.BZReplay.pause(true); window.BZ_DEBUG.seek(ms); }, end + 350 + 750 + 100);
  await sleep(150);
  const banner = await bannerOf();
  check('băng-rôn kết quả "' + want + '" đang hiện giữa thời gian giữ', banner.h === want && /show/.test(banner.cls), banner.h + ' ' + banner.cls + ' op=' + banner.op);
  await page.screenshot({ path: path.join(SHOTS, 'victory-1280.png') });

  // tua: lùi về giữa trận rồi tới cuối bằng nút
  await page.evaluate(ms => window.BZ_DEBUG.seek(ms), Math.round(end * 0.3));
  const s2 = await page.evaluate(() => window.BZ_DEBUG.state());
  check('tua về 30 % trận', Math.abs(s2.t - Math.round(end * 0.3)) < 200 && !s2.done, 't=' + Math.round(s2.t));
  await page.click('.bz-dock button[title^="Tới kết quả"]');
  await sleep(200);
  const s3 = await page.evaluate(() => window.BZ_DEBUG.state());
  check('nút "Tới kết quả" nhảy tới cuối', s3.done === true, 't=' + Math.round(s3.t));
  check('1280×720 không lỗi', errors.length === 0, errors.slice(0, 5).join(' || '));
  await page.close();
}

// ---------- P0 của review VFX (D:\bazaar-ref\review\VFX.md): khựng hình, ô vuông blend, khung còn sót sau trận ----------
async function p0(browser, base) {
  out.push('\n[P0 review VFX, 1280x720]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?view=1&a=3f3d11c5&b=1d95020b&seed=5&speed=1', { waitUntil: 'load' });
  await ready(page);
  // 7a. VFX-1: Infernal Envoy đánh Training Dummy 15 vào 2 máu còn lại → trước đây t đứng yên 27,7 s
  const hs = await page.evaluate(async () => {
    window.BZ_DEBUG.fight('3f3d11c5', '1d95020b', 5); window.BZ_DEBUG.speed(1);
    const t0 = performance.now(); let lastT = -1, lastChange = t0, maxStall = 0, at = 0;
    await new Promise(res => {
      function f(n) {
        const s = window.BZ_DEBUG.state();
        if (s.t !== lastT) { if (lastT > 0 && n - lastChange > maxStall) { maxStall = n - lastChange; at = lastT; } lastT = s.t; lastChange = n; }
        if (s.done || n - t0 > 30000) res(); else requestAnimationFrame(f);
      }
      requestAnimationFrame(f);
    });
    return { maxStall: Math.round(maxStall), at: Math.round(at), real: Math.round(performance.now() - t0), endMs: window.BZ_DEBUG.state().endMs, hsMax: window.BZReplay.stats.hitStopMax };
  });
  check('khựng hình mỗi lần ≤ 250 ms và có xảy ra (đòn kết liễu 100 % máu)', hs.hsMax > 0 && hs.hsMax <= 250, 'max ' + hs.hsMax + ' ms');
  check('trận kết liễu bằng sát thương thừa không đứng hình > 400 ms (cũ 27,7 s)', hs.maxStall < 400, JSON.stringify(hs));
  // 7b. bỏng/độc/bão cát không khựng: mọi lần gọi hitStop trùng lúc một đòn Damage chạm chân dung (e.t + 350 + trễ Multicast)
  const dot = await page.evaluate(async () => {
    window.BZ_DEBUG.fight('2b6ec186', '8cda08b2', 5);
    const RP = window.BZReplay, calls = [], orig = RP.hitStop;
    RP.hitStop = function (ms) { calls.push(RP.state().t); return orig.apply(RP, arguments); };
    window.BZ_DEBUG.speed(3);
    const t0 = performance.now();
    await new Promise(res => { function f(n) { if (window.BZ_DEBUG.state().done || n - t0 > 60000) res(); else requestAnimationFrame(f); } requestAnimationFrame(f); });
    RP.hitStop = orig;
    const S = RP.state(), hits = [];
    S.evs.forEach((e, i) => { if (e.type === 'damage' && (e.kind || 'Damage') === 'Damage') hits.push(e.t + RP.LAG_HERO + (S.delay[i] || 0)); });
    const ticks = S.evs.filter(e => e.type === 'damage' && e.kind !== 'Damage' && e.hp > 0).length;
    const stray = calls.filter(tc => !hits.some(h => tc >= h - 1 && tc <= h + 250));
    return { calls: calls.length, ticks, stray: stray.map(Math.round).slice(0, 5) };
  });
  check('bỏng/độc/bão cát không gây khựng hình (' + dot.ticks + ' nhịp DoT, ' + dot.calls + ' lần khựng đều trùng đòn Damage)', dot.ticks > 0 && dot.stray.length === 0, JSON.stringify(dot));

  // 8. VFX-2/7/8: đọc điểm ảnh canvas FX sau khi vẽ đạn + chớp trúng
  const bl = await page.evaluate(async () => {
    window.BZ_DEBUG.pause(true);
    const F = window.BZFX, M = window.BZ_VFXMAP, ids = new Set(['glow', 'flash', 'dot', 'star', 'arrow', 'heroWave', 'tri', 'shield', 'dots', 'heart']);
    const KIND = { PlayerDamage: 'damage', PlayerBurnApply: 'burn', PlayerPoisonApply: 'poison', PlayerHeal: 'heal', PlayerRegenApply: 'regen', PlayerShieldApply: 'shield',
      CardFreeze: 'freeze', CardSlow: 'slow', CardHaste: 'haste', CardCharge: 'charge', CardReload: 'reload', CardDestroy: 'destroy' };
    Object.keys(KIND).forEach(a => { const E = M.defaults[a]; ['projectile', 'impact', 'buildup'].forEach(k => { if (E[k]) { const id = F.mapSprite(E[k]); if (id) ids.add(id); } }); });
    const w0 = performance.now();
    while (performance.now() - w0 < 20000 && [...ids].some(id => !F.texInfo(id))) await new Promise(r => setTimeout(r, 100));
    const missing = [...ids].filter(id => !F.texInfo(id));
    const cv = document.getElementById('bz-fx'), g = cv.getContext('2d');
    let dark = 0, lit = 0, worst = {};
    function count(tag) {
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let dk = 0;
      for (let i = 0; i < d.length; i += 8) { const a = d[i + 3]; if (a > 50) lit++; if (a > 180 && Math.max(d[i], d[i + 1], d[i + 2]) < 40) dk++; }
      if (dk) worst[tag] = dk;
      dark += dk;
    }
    for (const a of Object.keys(KIND)) for (const f of [0.15, 0.4, 0.65, 0.9]) {
      F.clear(); F.frame(5000, 0);
      const E = M.defaults[a], tr = E.visualTravelMs || E.travelMs || 350;
      F.projectile({ from: { x: 500, y: 540 }, to: { x: 1400, y: 540 }, kind: KIND[a], t0: 5000, travel: tr, entry: E, arc: 0 });
      F.frame(5000 + tr * f, 16); count(a + '@' + f);
    }
    for (const [k, a] of [['heal', 'PlayerHeal'], ['regen', 'PlayerRegenApply'], ['shield', 'PlayerShieldApply']]) for (const dt of [0, 100, 200, 350]) {
      F.clear(); F.frame(5000, 0); F.burst(k, 960, 540, { t0: 5000, entry: M.defaults[a] }); F.frame(5000 + dt, 16); count(k + '+' + dt);
    }
    F.clear();
    return { dark, lit, worst, missing, star: F.texInfo('m:FX_Star_01_T'), swoosh: F.texInfo('m:FX_Heal_Swoosh_Atlas_T'), glow01: F.texInfo('m:FX_Glow_01_T') };
  });
  check('texture nạp đủ để đo (' + (bl.missing.length ? 'thiếu ' + bl.missing.join(',') : 'đủ') + ') và có vẽ', bl.missing.length === 0 && bl.lit > 1000, 'điểm sáng ' + bl.lit);
  check('FX_Star_01_T / FX_Heal_Swoosh_Atlas_T (nền đen, gói kênh) đã nướng alpha', !!bl.star && bl.star.packed && !!bl.swoosh && bl.swoosh.packed, JSON.stringify({ star: bl.star, swoosh: bl.swoosh }));
  check('0 điểm ảnh "tối mà đặc" trên canvas FX (ô vuông đen/xám của blend cộng)', bl.dark === 0, JSON.stringify(bl.worst));

  // 9. VFX-3: khung khiên bật giữa trận (Harkuvian đấu Mad Diver có khiên từ ~2,5 s), tắt khi trận ngã ngũ, clearCards gỡ sạch
  const fr = await page.evaluate(async () => {
    window.BZ_DEBUG.fight('aa372e93', '40e83ce1', 5); window.BZ_DEBUG.speed(3);
    const q = () => document.querySelectorAll('.bz-sh-frame.on, .bz-enr-frame.on, .bz-enr-vig.on, .bz-rowglow.go').length;
    let mid = 0; const t0 = performance.now();
    await new Promise(res => { function f(n) { const s = window.BZ_DEBUG.state(); if (!s.done && s.t < s.endMs) mid = Math.max(mid, document.querySelectorAll('.bz-sh-frame.on').length); if (s.done || n - t0 > 60000) res(); else requestAnimationFrame(f); } requestAnimationFrame(f); });
    const atEnd = document.querySelectorAll('.bz-sh-frame.on, .bz-enr-frame.on, .bz-enr-vig.on').length;
    window.BZView.clearCards();
    return { mid, atEnd, afterClear: q() };
  });
  check('khung khiên có bật giữa trận', fr.mid > 0, JSON.stringify(fr));
  check('khung khiên/nộ tắt khi trận ngã ngũ, clearCards() (dỡ trận) gỡ sạch', fr.atEnd === 0 && fr.afterClear === 0, JSON.stringify(fr));
  check('P0 không lỗi', errors.length === 0, errors.slice(0, 5).join(' || '));
  await page.close();
}

async function phone(browser, base) {
  out.push('\n[844x390 điện thoại ngang]');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?a=' + MA.Id.slice(0, 8) + '&b=' + MB.Id.slice(0, 8) + '&seed=' + SEED, { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(ms => { window.BZ_DEBUG.seek(ms); window.BZ_DEBUG.speed(1); }, Math.round(NODE.endMs * 0.55));
  await sleep(900);
  const uid = await page.evaluate(() => window.BZ_DEBUG.cardUids().find(u => /^b-/.test(u)));
  const box = await page.locator('.bz-card[data-uid="' + uid + '"]').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(350);
  const tip = await page.evaluate(() => { const t = document.querySelector('.bz-tip'); return t && t.classList.contains('show'); });
  check('chạm thẻ trên điện thoại mở tooltip', tip === true);
  await page.screenshot({ path: path.join(SHOTS, 'phone-844x390.png') });
  const fit = await page.evaluate(() => { const r = document.getElementById('bz-stage').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left, y: r.top }; });
  check('sân khấu vừa khít màn 844×390 (letterbox)', fit.w <= 845 && fit.h <= 391 && fit.x >= -1 && fit.y >= -1, JSON.stringify(fit));
  // MOBILE-2: chữ tooltip 23 px sân khấu × scale 0,36 = 8 px → tooltip phóng theo 1/scale
  const tipPx = await page.evaluate(() => { const ln = document.querySelector('.bz-tip .ln'); if (!ln) return null;
    return { px: parseFloat(getComputedStyle(ln).fontSize) * window.BZView.scale * (window.BZTooltip.lastScale || 1), k: window.BZTooltip.lastScale, s: window.BZView.scale,
      r: (() => { const b = document.querySelector('.bz-tip').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })() }; });
  check('tooltip điện thoại: chữ dòng hiệu ứng ≥ 12 px thật (MOBILE-2)', !!tipPx && tipPx.px >= 12, JSON.stringify(tipPx));
  check('tooltip điện thoại nằm trong màn', !!tipPx && tipPx.r.x >= -1 && tipPx.r.y >= -1 && tipPx.r.x + tipPx.r.w <= 845 && tipPx.r.y + tipPx.r.h <= 391, tipPx && JSON.stringify(tipPx.r));
  check('844×390 không lỗi', errors.length === 0, errors.slice(0, 5).join(' || '));
  await ctx.close();
}

(async () => {
  let srv = null, base = process.env.BZ_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  out.push('Chợ Phiên — xem trận @ ' + base + '  (Node: ' + MA.InternalName + ' vs ' + MB.InternalName + ', seed ' + SEED + ' → winner ' + NODE.winner + ', endMs ' + NODE.endMs + ')');
  const args = process.env.BZ_SOFT ? [] : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11'];
  const browser = await chromium.launch({ args });
  try {
    await desktop(browser, base);
    await p0(browser, base);
    await phone(browser, base);
  } catch (e) {
    check('chạy hết bộ kiểm', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
  out.push('\nẢnh chụp: ' + SHOTS);
  out.push(pass + ' đạt, ' + fail + ' trượt');
  console.log(out.join('\n'));
  process.exit(fail ? 1 : 0);
})();
