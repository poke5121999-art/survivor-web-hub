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
 * 11. (vòng 7, W-10 P0) Transform giữa trận: Virus / Mirror / 3D Printer / Abducted Cow đổi hình + khung + bậc đúng mốc sự kiện (cả tua và phát thật),
 *     thẻ sinh ra (spawned) hiện đúng chỗ tại spawnedAt, tua lùi trả về dạng gốc.
 * 12. (W-11) FX-03 `play:false` không đạn; FX-09 `abilityId` chọn prefab riêng của ability (Rainbow Potion); FX-17 reload không khoá không đạn.
 * 13. (W-12) rung dài pct×0,04 s; chip hẹn giờ dùng sprite CardTimer_*_BG khi có; tia chớp băng-rôn thua dùng FX_Lighting_03_2x2_T khi có.
 * 14. (W-13) FX-15 thẻ nguồn nháy khung theo hướng thẻ đích; FX-16 lớp phủ Heated/Chilled bật, tua về 0 thì tắt.
 * 15. (FX-06) luật cường độ nhạc trận: 0,66 → 1, 0,33 → 2, thấp hơn → 3, không đổi khi đang chạy chậm hay tham số ≥ 4.
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
  // FX-01: đòn kết liễu chạy chậm là đồng hồ HIỂN THỊ — hệ số xuống 0,2, giữ 2,5 s thật, hồi 1 s thật; kết quả sim (người thắng, máu) không đổi
  const sl = await page.evaluate(() => { const S = window.BZReplay.state(), st = window.BZReplay.stats; return { min: st.slowMin, real: Math.round(st.slowRealMs), hp: S.res.players.map(p => p.health), winner: S.res.winner, mode: S.slowMode }; });
  check('FX-01: hệ số thời gian hạ xuống 0,2 ở đòn kết liễu (min ' + sl.min.toFixed(2) + ')', NODE.winner === 'draw' || (sl.min >= 0.19 && sl.min <= 0.21), JSON.stringify(sl));
  check('FX-01: chạy chậm kéo dài ≥ 3,0 s thật (giữ 2,5 s + hồi 1 s) rồi về 1×', NODE.winner === 'draw' || (sl.real >= 3000 && sl.real <= 5000 && sl.mode === 4), JSON.stringify(sl));
  check('FX-01: người thắng + máu cuối giống BZSim.run trong Node (' + NODE.winner + ', ' + NODE.players.map(p => p.health).join('/') + ')', sl.winner === NODE.winner && sl.hp.join() === NODE.players.map(p => p.health).join(), JSON.stringify(sl));
  // FX-05: số chí mạng ≈ 3,85× số đòn nhỏ (5,0 so với 1,3 — ScrollingTextTypeConfig)
  const cs = await page.evaluate(() => { const F = window.BZFX; F.clear(); const a = F.number({ x: 600, y: 500, kind: 'damage', value: 24, frac: 0.02, t0: 0, side: 0 });
    const b = F.number({ x: 600, y: 500, kind: 'damage', value: 24, crit: true, frac: 0.02, t0: 0, side: 1 }); F.clear(); return { small: a.s, crit: b.s, ratio: b.s / a.s }; });
  check('FX-05: số chí mạng lớn 3,5-4× số đòn nhỏ (' + cs.ratio.toFixed(2) + '×)', cs.ratio >= 3.5 && cs.ratio <= 4.0, JSON.stringify(cs));
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
  check('UI-09: băng-rôn kết quả đang hiện khi màn kết quả CHƯA mở (trận chưa done)', banner.h === want && (await page.evaluate(() => window.BZReplay.state().done)) === false, banner.h);
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


// ---------- vòng 7 (W-10..W-13) ----------
// bàn tuỳ ý cho BZ_DEBUG.fightBoards; thẻ tổng hợp 'killer' (phá món đối thủ mỗi 1 s) đăng ký cả ở Node lẫn trong trang
const NARWHAL = '00e3a7ff-af5e-47ce-a2c0-2d4ec31ac7d7', RIFLE = '0591d8b4-2632-4c41-9f73-48896237256d';
const byName = n => Object.keys(globalThis.BZ_CARDS).find(k => globalThis.BZ_CARDS[k].InternalName === n);
const ID = { Virus: byName('Virus'), Mirror: byName('Mirror'), Printer: byName('3D Printer'), Cow: byName('Abducted Cow'), Jerky: byName('Jerky'), Rainbow: byName('Rainbow Potion') };
const KILLER = { $type: 'TCardItem', Type: 'Item', Id: 'killer', InternalName: 'killer', StartingTier: 'Bronze', Size: 'Small', Heroes: ['Common'], Tags: [], HiddenTags: [],
  Localization: { Title: { Text: 'killer' }, Tooltips: [] },
  Abilities: { 0: { Id: '0', ActiveIn: 'HandOnly', Priority: 'Medium', Trigger: { $type: 'TTriggerOnCardFired' },
    Action: { $type: 'TActionCardDestroy', Target: { $type: 'TTargetCardSection', TargetSection: 'OpponentHand' } } } }, Auras: {},
  Tiers: { Bronze: { Attributes: { CooldownMax: 1000, DestroyTargets: 1, Multicast: 1 }, AbilityIds: ['0'], AuraIds: [], TooltipIds: [] } } };
BZ.extraCards = BZ.extraCards || {}; BZ.extraCards.killer = KILLER;
let uidN = 0;
const mk = (id, socket, o) => Object.assign({ uid: 'w' + (uidN++), id, tier: 'Bronze', ench: null, socket, size: 1, owner: 0, section: 'hand' }, o || {});
const brd = (name, cards) => ({ name, hero: null, level: 1, healthMax: 800, cards });
const SC = {
  printer: () => [brd('A', [mk(NARWHAL, 0, { uid: 'g0' }), mk(ID.Printer, 1, { uid: 'pr', size: 3, tier: 'Gold' })]), brd('B', [])],
  virus: () => [brd('A', [mk(ID.Virus, 0, { uid: 'vir', tier: 'Silver' })]), brd('B', [mk(NARWHAL, 0, { uid: 'o0', owner: 1 }), mk(NARWHAL, 1, { uid: 'o1', owner: 1 })])],
  mirror: () => [brd('A', [mk(RIFLE, 0, { uid: 'mg', size: 2 }), mk(ID.Mirror, 2, { uid: 'mir', size: 2, tier: 'Gold' })]), brd('B', [])],
  cow: () => [brd('A', [mk('killer', 0, { uid: 'kl' })]), brd('B', [mk(ID.Cow, 0, { uid: 'cow', size: 2, tier: 'Silver', owner: 1 })])]
};
async function startBoards(page, boards, seed) {
  await page.evaluate(([a, b, sd, ex]) => { window.BZSim.extraCards = window.BZSim.extraCards || {}; window.BZSim.extraCards.killer = ex;
    const D = window.BZ_DEBUG; D.fightBoards(a, b, sd, {}); D.speed(1); D.pause(true); D.seek(0); }, [boards[0], boards[1], seed, KILLER]);
}
// đọc dạng hiện tại của mọi thẻ bàn: {uid: {id, tier, size, shown, left, art}}
const snap = page => page.evaluate(() => {
  const out = {}, cs = window.BZView.cards();
  Object.keys(cs).forEach(u => {
    const el = cs[u].el, B = el._bz, r = el.getBoundingClientRect();
    out[u] = { id: B.inst.id, tier: B.inst.tier, size: B.inst.size, cls: el.className, shown: el.style.display !== 'none' && el.isConnected, left: parseFloat(el.style.left),
      art: (el.querySelector('.art').style.backgroundImage || '').replace(/^url\("?|"?\)$/g, '').replace(/\?v=.*$/, ''), w: Math.round(B.w) };
  });
  return out;
});
async function wave2(browser, base) {
  out.push('\n[vòng 7: Transform, FX test, rung, chip, FX-06]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = watch(page);
  await page.goto(base + '/games/bazaar/index.html?view=1&speed=1', { waitUntil: 'load' });
  await ready(page);
  const artOf = id => page.evaluate(i => (window.BZ_ART.map[i] || ''), id);
  const seekTo = ms => page.evaluate(m => { window.BZReplay.pause(true); window.BZ_DEBUG.seek(m); }, ms);
  const tfEv = () => page.evaluate(() => window.BZReplay.state().evs.filter(e => e.type === 'transform').map(e => ({ t: e.t, target: e.target, from: e.from, to: e.to, tier: e.tier, socket: e.socket, size: e.size })));
  const nodeTf = boards => BZ.run({ boards, seed: 3, sandstorm: true }).frames.reduce((a, f) => a.concat(f.ev.filter(e => e.type === 'transform').map(e => ({ t: e.t, target: e.target, from: e.from, to: e.to, tier: e.tier, socket: e.socket, size: e.size }))), []);

  // ----- 3D Printer: thẻ Large Gold → 3 Narwhal; hai bản sinh ra ở ô 2, 3 -----
  await startBoards(page, SC.printer(), 3);
  let tf = await tfEv();
  check('W-10 3D Printer: 3 sự kiện transform ở t=5000 (trang = Node)', JSON.stringify(tf) === JSON.stringify(nodeTf(SC.printer())) && tf.length === 3 && tf.every(e => e.t === 5000), JSON.stringify(tf));
  const pr0 = await page.evaluate(() => window.BZReplay.state().res.cards.filter(c => c.spawned).map(c => [c.uid, c.spawnedAt]));
  check('W-10 3D Printer: result.cards có 2 thẻ spawned, spawnedAt 5000', pr0.length === 2 && pr0.every(c => c[1] === 5000), JSON.stringify(pr0));
  await seekTo(4900);
  let sn = await snap(page);
  const spawnedUids = pr0.map(c => c[0]);
  check('W-10 trước 5000: máy in còn là máy in (id, bậc Gold, cỡ 3) và 2 thẻ spawned đang ẩn',
    sn.pr.id === ID.Printer && sn.pr.tier === 'Gold' && sn.pr.size === 3 && spawnedUids.every(u => !sn[u] || !sn[u].shown), JSON.stringify(sn.pr) + ' / ' + JSON.stringify(spawnedUids.map(u => sn[u] && sn[u].shown)));
  const L0 = { g0: sn.g0.left, pr: sn.pr.left };
  await seekTo(5300);
  sn = await snap(page);
  const NW = await artOf(NARWHAL);
  check('W-10 sau 5000: thẻ máy in đổi thành Narwhal (id, art, cỡ 1, khung Bronze lớp t-Bronze)', sn.pr.id === NARWHAL && sn.pr.size === 1 && sn.pr.art === NW && /t-Bronze/.test(sn.pr.cls), JSON.stringify(sn.pr));
  check('W-10 sau 5000: hai thẻ spawned hiện, là Narwhal, ở ô liền kề (cách đúng một bước thẻ)',
    spawnedUids.length === 2 && spawnedUids.every(u => sn[u] && sn[u].shown && sn[u].id === NARWHAL && sn[u].art === NW) &&
      Math.abs(sn[spawnedUids[0]].left - sn.pr.left - (await page.evaluate(() => window.BZView.BOARD.pitch))) < 1 && Math.abs(sn[spawnedUids[1]].left - sn[spawnedUids[0]].left - (await page.evaluate(() => window.BZView.BOARD.pitch))) < 1,
    JSON.stringify(spawnedUids.map(u => sn[u])));
  check('W-10 bố cục bàn không xê dịch khi thẻ spawned hiện (thẻ g0 đứng yên)', Math.abs(sn.g0.left - L0.g0) < 0.5, sn.g0.left + ' vs ' + L0.g0);
  await seekTo(2000);
  sn = await snap(page);
  check('W-10 tua lùi về 2000: máy in trở lại dạng gốc, spawned ẩn lại', sn.pr.id === ID.Printer && sn.pr.size === 3 && spawnedUids.every(u => !sn[u].shown), JSON.stringify([sn.pr.id, sn.pr.size, spawnedUids.map(u => sn[u].shown)]));
  // phát thật 3×: chớp (xform/spawn) hiện đúng lúc, trạng thái cuối giống tua
  const live = await page.evaluate(async () => {
    window.BZ_DEBUG.seek(0); const seen = { xform: 0, spawn: 0 }, cl = window.BZView.refs.cardLayer;
    const mo = new MutationObserver(ms => ms.forEach(m => { const c = m.target.classList; if (c.contains('xform')) seen.xform++; if (c.contains('spawn')) seen.spawn++; }));
    mo.observe(cl, { attributes: true, subtree: true, attributeFilter: ['class'] });
    window.BZ_DEBUG.speed(3);
    const t0 = performance.now();
    await new Promise(res => { function f(n) { const s = window.BZ_DEBUG.state(); if (s.t > 5600 || n - t0 > 20000) res(); else requestAnimationFrame(f); } requestAnimationFrame(f); });
    await new Promise(r => setTimeout(r, 120));
    mo.disconnect(); window.BZReplay.pause(true);
    return { seen, t: Math.round(window.BZ_DEBUG.state().t) };
  });
  sn = await snap(page);
  check('W-10 phát thật: thẻ đổi hình ở mốc 5000 mà không cần tua (chớp xform + spawn có chạy)', live.seen.xform > 0 && live.seen.spawn > 0 && sn.pr.id === NARWHAL && spawnedUids.every(u => sn[u].shown && sn[u].id === NARWHAL), JSON.stringify({ live, pr: sn.pr.id }));
  await page.screenshot({ path: path.join(SHOTS, 'w10-printer-after.png') });
  await seekTo(4900); await page.screenshot({ path: path.join(SHOTS, 'w10-printer-before.png') });

  // ----- Virus: món Narwhal của đối thủ thành Virus Silver ở t=8000 -----
  await startBoards(page, SC.virus(), 3);
  tf = await tfEv();
  check('W-10 Virus: transform đầu [t, từ, sang, bậc] = [8000, Narwhal, Virus, Silver] (lần hai ở 16000)', tf.length >= 1 && tf[0].t === 8000 && tf[0].from === NARWHAL && tf[0].to === ID.Virus && tf[0].tier === 'Silver', JSON.stringify(tf));
  const vt = tf.length ? tf[0].target : null;
  await seekTo(7900); sn = await snap(page); const pre = sn[vt];
  await seekTo(8300); sn = await snap(page);
  check('W-10 Virus: đích đổi id + art + bậc (Silver) sau 8000, trước đó còn Narwhal Bronze',
    !!pre && pre.id === NARWHAL && pre.tier === 'Bronze' && sn[vt].id === ID.Virus && sn[vt].art === (await artOf(ID.Virus)) && sn[vt].tier === 'Silver' && /t-Silver/.test(sn[vt].cls), JSON.stringify([pre, sn[vt]]));
  await page.screenshot({ path: path.join(SHOTS, 'w10-virus-after.png') });
  await seekTo(7900); await page.screenshot({ path: path.join(SHOTS, 'w10-virus-before.png') });

  // ----- Mirror: Medium Gold chép Air-Pressure Rifle bên trái -----
  await startBoards(page, SC.mirror(), 3);
  tf = await tfEv();
  check('W-10 Mirror: 1 transform [t, từ, sang] = [3000, Mirror, Rifle]', tf.length === 1 && tf[0].t === 3000 && tf[0].from === ID.Mirror && tf[0].to === RIFLE, JSON.stringify(tf));
  await seekTo(3300); sn = await snap(page);
  check('W-10 Mirror: sau 3000 thẻ Mirror mang art + id của Rifle, cỡ 2', sn.mir.id === RIFLE && sn.mir.art === (await artOf(RIFLE)) && sn.mir.size === 2, JSON.stringify(sn.mir));
  await seekTo(2900); sn = await snap(page);
  check('W-10 Mirror: tua lùi trước 3000 còn là Mirror', sn.mir.id === ID.Mirror && sn.mir.tier === 'Gold', JSON.stringify(sn.mir));

  // ----- Abducted Cow: bị phá thành 2 Jerky -----
  await startBoards(page, SC.cow(), 3);
  tf = await tfEv();
  check('W-10 Abducted Cow: thành 2 Jerky Silver, ô [0, 1], cỡ 1', tf.length === 2 && tf.every(e => e.to === ID.Jerky && e.tier === 'Silver' && e.size === 1) && tf[0].socket === 0 && tf[1].socket === 1, JSON.stringify(tf));
  const cowSp = await page.evaluate(() => window.BZReplay.state().res.cards.filter(c => c.spawned).map(c => c.uid));
  await seekTo(tf.length ? tf[0].t + 300 : 2000); sn = await snap(page);
  check('W-10 Abducted Cow: thẻ gốc thành Jerky + 1 thẻ spawned Jerky hiện, thẻ gốc không còn là đống đổ nát',
    sn.cow.id === ID.Jerky && sn.cow.size === 1 && cowSp.length === 1 && sn[cowSp[0]].shown && sn[cowSp[0]].id === ID.Jerky && !/destroyed/.test(sn.cow.cls), JSON.stringify([sn.cow, sn[cowSp[0]]]));

  // ----- W-11: FX-03 / FX-09 / FX-17 -----
  await startBoards(page, [brd('A', [mk(ID.Rainbow, 0, { uid: 'rb' }), mk(NARWHAL, 1, { uid: 'nw' })]), brd('B', [mk(NARWHAL, 0, { uid: 'o0', owner: 1 })])], 3);
  const w11 = await page.evaluate(([rid, nid]) => {
    const RP = window.BZReplay, F = window.BZFX, M = window.BZ_VFXMAP, r = {};
    F.clear();
    const dmg = ab => ({ type: 'damage', src: 'nw', target: 'p1', amt: 5, hp: 5, shield: 0, kind: 'Damage', t: 100, abilityId: ab });
    const ccard = M.cards[nid] || (M.cards[nid] = { prefab: 'Assets/Test/Narwhal.prefab', action: 'PlayerDamage', projectile: 'FX_Star_01_T', visualTravelMs: 200, travelMs: 200 });
    const saved = JSON.stringify(ccard);
    F.clear(); RP.FX.damage(dmg('0'), { d: 0 }); r.dmgBase = F.counts().projs;
    ccard.abilities = { 0: { action: 'PlayerDamage', play: false } };
    F.clear(); RP.FX.damage(dmg('0'), { d: 0 }); r.dmgNoPlay = F.counts().projs;
    delete ccard.abilities; M.cards[nid] = JSON.parse(saved);
    // FX-09: Rainbow Potion có 4 ability, mỗi cái một prefab; ability '1' (Poison) không được dùng prefab Burn của thẻ
    const rc = M.cards[rid], burn = rc.prefab;
    r.e0 = (RP.resolveEntry('rb', 'burn', '0').E || {}).prefab;
    r.e1 = (RP.resolveEntry('rb', 'poison', '1').E || {}).prefab || null;
    r.k1 = RP.resolveEntry('rb', 'poison', '1').keyed;
    r.burn = burn; r.p1 = rc.abilities['1'].prefab;
    // FX-17: reload không khoá prefab → không đạn; có khoá → đạn
    const saved2 = M.cards[nid]; M.cards[nid] = { abilities: { 0: { action: 'CardReload' } } };
    F.clear(); RP.FX.reload({ type: 'reload', src: 'nw', target: 'rb', amt: 1, t: 100, abilityId: '0' }, { d: 0 }); r.reloadKeyless = F.counts().projs;
    M.cards[nid] = { prefab: 'Assets/X/Reload.prefab', action: 'CardReload', projectile: 'FX_Star_01_T', visualTravelMs: 200, travelMs: 200,
      abilities: { 0: { action: 'CardReload', key: 'Assets/X/Reload.prefab', prefab: 'Assets/X/Reload.prefab' } } };
    F.clear(); RP.FX.reload({ type: 'reload', src: 'nw', target: 'rb', amt: 1, t: 100, abilityId: '0' }, { d: 0 }); r.reloadKeyed = F.counts().projs;
    M.cards[nid] = saved2; F.clear();
    return r;
  }, [ID.Rainbow, NARWHAL]);
  check('W-11 FX-03: ability play:false không bắn đạn (có đạn khi play mặc định)', w11.dmgBase === 1 && w11.dmgNoPlay === 0, JSON.stringify(w11));
  check('W-11 FX-09: abilityId chọn prefab riêng — ability 0 dùng Burn, ability 1 (Poison) không dùng prefab Burn của thẻ', /Burn/.test(w11.e0 || '') && w11.p1 !== w11.burn && w11.e1 !== w11.burn && w11.k1 === true, JSON.stringify(w11));
  check('W-11 FX-17: reload không khoá prefab không đạn, có khoá thì có đạn', w11.reloadKeyless === 0 && w11.reloadKeyed === 1, JSON.stringify({ k: w11.reloadKeyless, y: w11.reloadKeyed }));

  // ----- W-12: rung, chip CardTimer, tia chớp băng-rôn -----
  const w12 = await page.evaluate(() => {
    const V = window.BZView, r = {};
    V.shake(1, 0); r.s1 = V.shakeInfo().dur; V.shake(0.5, 0); r.s5 = V.shakeInfo().dur; V.shake(0, 0);
    const F = window.BZFX, A = window.BZ_ART.map, keep = A['ui:CardTimer_Haste_BG'];
    const mkcard = () => window.BZCard.create({ uid: 'z', id: 'x', tier: 'Bronze', size: 1 }, { h: 230, attrs: {} });
    const c = mkcard(); r.chipYes = c._bz.chH.classList.contains('tex'); r.chipBg = c._bz.chH.style.backgroundImage;
    delete A['ui:CardTimer_Haste_BG']; r.chipNo = mkcard()._bz.chH.classList.contains('tex'); A['ui:CardTimer_Haste_BG'] = keep;
    const lk = A['fx:FX_Lighting_03_2x2_T']; delete A['fx:FX_Lighting_03_2x2_T'];
    F.resetStats(); F.burst('bannerLose', 960, 540, {}); r.partsNo = F.stats.particles;
    A['fx:FX_Lighting_03_2x2_T'] = lk;
    F.resetStats(); F.burst('bannerLose', 960, 540, {}); r.partsYes = F.stats.particles; F.clear();
    return r;
  });
  check('W-12 FX-18: rung dài pct × 0,04 s (pct 1 → 40 ms, 0,5 → 20 ms)', Math.abs(w12.s1 - 40) < 0.5 && Math.abs(w12.s5 - 20) < 0.5, JSON.stringify(w12));
  check('W-12 chip hẹn giờ: dùng sprite gốc CardTimer_Haste_BG đã bóc; bỏ khoá thì về viên CSS', w12.chipNo === false && w12.chipYes === true && /CardTimer_Haste_BG\.webp/.test(w12.chipBg), JSON.stringify(w12));
  check('W-12 băng-rôn thua: 5 tia chớp FX_Lighting_03_2x2_T gốc (khoá fx: trong BZ_ART), bỏ khoá thì không', w12.partsYes - w12.partsNo === 5, JSON.stringify(w12));

  // ----- W-13: FX-15 / FX-16 -----
  await startBoards(page, [brd('A', [mk(NARWHAL, 0, { uid: 'n0' }), mk(NARWHAL, 1, { uid: 'n1' }), mk(NARWHAL, 2, { uid: 'n2' })]), brd('B', [mk(NARWHAL, 0, { uid: 'o0', owner: 1 })])], 3);
  const w13 = await page.evaluate(() => {
    const RP = window.BZReplay, V = window.BZView, r = {}, cls = u => V.cardEl(u).className;
    RP.neighbourTrigger({ src: 'n0', target: 'n2' }, 0); r.right = /trig-r/.test(cls('n0'));
    RP.neighbourTrigger({ src: 'n2', target: 'n1' }, 0); r.left = /trig-l/.test(cls('n2'));
    RP.neighbourTrigger({ src: 'n1', target: 'o0' }, 0); r.cross = /trig-/.test(cls('n1'));
    RP.APPLY.heat({ target: 'n1', amt: 1, cur: 1 }); r.heated = /heated/.test(cls('n1'));
    RP.APPLY.attr({ target: 'n2', attr: 'Chilled', amt: 1, cur: 1 }); r.chilled = /chilled/.test(cls('n2'));
    window.BZ_DEBUG.seek(100); r.reset = !/heated|chilled/.test(cls('n1') + cls('n2'));
    return r;
  });
  check('W-13 FX-15: thẻ nguồn nháy trig-r khi đích ở bên phải, trig-l bên trái, không nháy khi đích là bàn đối thủ', w13.right && w13.left && !w13.cross, JSON.stringify(w13));
  check('W-13 FX-16: Heated / Chilled bật lớp phủ, tua (seek) về đầu thì tắt', w13.heated && w13.chilled && w13.reset, JSON.stringify(w13));
  const hc = await page.evaluate(() => { window.BZReplay.APPLY.heat({ target: 'n1', amt: 1, cur: 1 }); const el = window.BZView.cardEl('n1').querySelector('.hc.heat'); const cs = getComputedStyle(el); return { tr: cs.transitionDuration, bg: cs.backgroundImage.slice(0, 20) }; });
  check('W-13 FX-16: lớp phủ mờ vào 0,333 s', hc.tr === '0.333s', JSON.stringify(hc));

  // ----- FX-06: luật cường độ nhạc -----
  const mi = await page.evaluate(() => { const f = window.BZReplay.musicIntensity; return [f(1, 0, false), f(0.9, 0, false), f(0.5, 1, false), f(0.2, 2, false), f(0.2, 3, false), f(0.2, 4, false), f(0.2, 1, true), f(0.7, 3, false)]; });
  check('FX-06: luật cường độ nhạc [1→0, 0,9→1, 0,5→2, 0,2→3, giữ 3, ≥4 giữ, chạy chậm giữ, hồi 0,7 → 1] = [0,1,2,3,3,4,1,1]', JSON.stringify(mi) === JSON.stringify([0, 1, 2, 3, 3, 4, 1, 1]), JSON.stringify(mi));
  check('vòng 7 không lỗi', errors.length === 0, errors.slice(0, 5).join(' || '));
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
    await wave2(browser, base);
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
