/*
 * w7menus (WORLD-GAPS.md §6 W7): ô lưu, cài đặt, credits.
 *   - Lưu ở ô 2, tải lại trang: ô 2 trả đúng bến và tiền, ô 1 không bị đụng (byte-for-byte); xoá có hỏi lại.
 *   - Chế độ PASSIVE / NIGHTMARE: DREvents.rollFrequency = worldEventRollFrequency của GameConfigData; bốc thăm thật chạy theo đó.
 *   - Cài đặt: mở từ màn tiêu đề và từ màn tạm dừng, lưu qua lần tải lại, âm lượng / tốc độ chữ / đồng hồ / đơn vị / camera có tác dụng.
 *   - Credits cuộn hết rồi về màn tiêu đề; giữ Esc 1 s thì bỏ qua.
 * Chạy: node test/dredge-w7menus.js    Ảnh: SHOTS (mặc định %TEMP%/dredge-w7menus)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w7menus');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const ev = (page, f, a) => page.evaluate(f, a);

async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || !!(document.getElementById('dr-dlg') && document.getElementById('dr-dlg').classList.contains('on'));
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}
async function enterGame(page) {
  await page.waitForFunction(() => DR.mode === 'dock' || DR.mode === 'sail', null, { timeout: 20000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  if (await ev(page, () => DR.mode) === 'dock') await dockReady(page);
  await sleep(600);
}
async function toTitleByPause(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('#dr-pause:not([hidden])', { timeout: 5000 });
  await page.click('#btn-quit');
  await page.waitForSelector('#dr-title:not([hidden])', { timeout: 8000 });
  await sleep(300);
}

(async () => {
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
  await sleep(200);
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port) + '/games/dredge/index.html';
  const br = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  const boot = async q => {
    await page.goto(base + (q || ''));
    await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
    await page.waitForSelector('#dr-title:not([hidden])', { timeout: 20000 });
  };
  await boot('?fresh=1');

  // ---- 0. dữ liệu sinh bởi tools/credits.py
  const dt = await ev(page, () => {
    const C = DR_CREDITS.credits, S = DR_CREDITS.settings;
    return { speed: C.speedPxPerSecond, short: C.short.map(p => p.rows.length), long: C.long.length, grids: C.long.filter(b => b.k === 'grid').map(b => b.names.length + 'x' + b.cols),
      ev: C.events, types: S.typewriterSpeeds, hold: S.holdTimes, freq: S.worldEventRollFrequency, def: S.defaults.cameraInvertY, sens: S.defaults.cameraSensitivityX,
      continueHidden: document.getElementById('btn-continue').hidden };
  });
  ok(dt.speed === 100 && dt.short.join() === '4,2' && dt.long > 400, 'credits data: ' + JSON.stringify(dt).slice(0, 200));
  ok(dt.grids.join() === '15x2,12x4,123x5,15x2', 'credit grids ' + dt.grids);
  ok(JSON.stringify(dt.ev) === '[[7,"CanShowSkipAction"],[11.5,"OnMainCreditsComplete"]]', 'credits events ' + JSON.stringify(dt.ev));
  ok(dt.types.join() === '0.5,1,2' && dt.hold.join() === '3,5,8' && dt.def === 1 && dt.sens === 0.5, 'settings data ' + JSON.stringify([dt.types, dt.hold, dt.def, dt.sens]));
  ok(dt.freq.PASSIVE === 0.1 && dt.freq.NIGHTMARE === 0.05, 'roll freq ' + JSON.stringify(dt.freq));
  ok(dt.continueHidden, '?fresh=1: Tiếp tục phải ẩn');

  // ---- 1. ô lưu
  // Chưa có sổ: Ván mới vào thẳng (ô 1) mà không hỏi ô.
  await page.click('#btn-new');
  ok(!(await ev(page, () => DRMenus.slots.isOpen)), 'Ván mới lúc chưa có sổ nào không được hỏi ô lưu');
  await enterGame(page);
  ok(await ev(page, () => DR.slot) === 0, 'ván đầu phải ở ô 0');
  await ev(page, () => { DR.s.funds = 111; });
  ok(await ev(page, () => DR.save()), 'DR.save ô 0 thất bại');
  const raw0 = await ev(page, () => localStorage.getItem('dredge.save.v1'));
  ok(!!raw0 && JSON.parse(raw0).funds === 111, 'ô 0 chưa có tiền 111');
  await toTitleByPause(page);
  ok(await page.isVisible('#btn-continue'), 'Tiếp tục phải hiện khi có sổ');
  // Có sổ rồi: Ván mới hỏi ô; ô 1 trống = "Mới"
  await page.click('#btn-new');
  await page.waitForSelector('.dm-win.slots', { state: 'visible', timeout: 3000 });
  const cards = await ev(page, () => [...document.querySelectorAll('.dm-slot')].map(c => ({ n: +c.dataset.slot, empty: c.classList.contains('empty'), acts: [...c.querySelectorAll('[data-act]')].map(b => b.dataset.act), text: c.querySelector('.info').textContent })));
  ok(cards.length === 3 && !cards[0].empty && cards[1].empty && cards[2].empty, 'ba ô lưu: ' + JSON.stringify(cards));
  ok(cards[0].acts.join() === 'load,delete' && cards[1].acts.join() === 'new', 'nút của ô: ' + JSON.stringify(cards.map(c => c.acts)));
  ok(/Ngày 1 - Di vật: 0/.test(cards[0].text), 'thông tin ô 0: ' + cards[0].text);
  await page.screenshot({ path: path.join(OUT, 'slots-1280.png') });
  await page.click('.dm-slot[data-slot="1"] [data-act="new"]');
  ok(!(await ev(page, () => DRMenus.slots.isOpen)), 'cửa sổ ô lưu phải đóng sau khi chọn');
  await enterGame(page);
  ok(await ev(page, () => DR.slot) === 1, 'ván mới ở ô 2 phải có DR.slot = 1');
  ok(await ev(page, () => DR.s.funds) !== 111, 'ô 2 là ván mới, không mang tiền ô 1');
  await ev(page, () => { DR.s.funds = 222; });
  ok(await ev(page, () => DR.save()), 'DR.save ô 2 thất bại');
  const keys = await ev(page, () => ({ s0: localStorage.getItem('dredge.save.v1'), s1: JSON.parse(localStorage.getItem('dredge.save.v1.s1') || 'null') }));
  ok(keys.s0 === raw0, 'ô 1 bị đụng khi lưu ô 2');
  ok(keys.s1 && keys.s1.funds === 222 && keys.s1.dock === await ev(page, () => DR.s.dock), 'ô 2 thiếu tiền / bến');
  const dock1 = keys.s1.dock;
  await toTitleByPause(page);

  // tải lại trang: Tiếp tục hỏi ô (2 ô có sổ), ô 2 là ô gần nhất
  await boot('');
  ok(await page.isVisible('#btn-continue'), 'sau tải lại: Tiếp tục phải hiện');
  ok(await ev(page, () => DR.slot) === 1, 'sau tải lại DR.slot phải nhớ ô 2 (lastSaveSlot)');
  await page.click('#btn-continue');
  await page.waitForSelector('.dm-win.slots', { state: 'visible', timeout: 3000 });
  await page.click('.dm-slot[data-slot="1"] [data-act="load"]');
  await enterGame(page);
  const back = await ev(page, () => ({ slot: DR.slot, funds: DR.s.funds, dock: DR.s.dock, mode: DR.mode, s0: localStorage.getItem('dredge.save.v1') }));
  ok(back.slot === 1 && back.funds === 222 && back.dock === dock1, 'ô 2 không khôi phục bến + tiền: ' + JSON.stringify(back));
  ok(back.s0 === raw0, 'ô 1 bị đụng sau khi tải ô 2');

  // ---- 2. chế độ chơi → bốc thăm sự kiện
  const gm = await ev(page, () => {
    const out = {};
    for (const [i, m] of ['NORMAL', 'PASSIVE', 'NIGHTMARE'].entries()) { DRMenus.set('gameMode', i); out[m] = { mode: DREvents.gameMode, freq: DREvents.rollFrequency, api: DRMenus.gameMode() }; }
    DRMenus.set('gameMode', 0);
    return out;
  });
  const F = await ev(page, () => DR_CONFIG.worldEventRollFrequency);
  ok(['NORMAL', 'PASSIVE', 'NIGHTMARE'].every(m => gm[m].mode === m && gm[m].api === m && gm[m].freq === F[m]), 'gameMode → DREvents: ' + JSON.stringify(gm));
  // bốc thật: đặt time = lastRoll + x rồi đợi một khung; NIGHTMARE 0,05 bốc ở +0,07, NORMAL / PASSIVE 0,1 chưa
  async function rolls(mode, delta) {
    await ev(page, m => { DRMenus.set('gameMode', m); }, mode);
    await sleep(150);
    return ev(page, async d => {
      const lr = DREvents.debug.lastRoll;
      DR.s.time = lr + d;
      await new Promise(r => setTimeout(r, 400));
      return DREvents.debug.lastRoll !== lr && DREvents.debug.lastRoll >= lr + d - 0.02;
    }, delta);
  }
  ok(await rolls(2, 0.07) === true, 'NIGHTMARE: +0,07 ngày phải bốc thăm (tần suất 0,05)');
  ok(await rolls(0, 0.07) === false, 'NORMAL: +0,07 ngày chưa được bốc (tần suất 0,1)');
  ok(await rolls(0, 0.11) === true, 'NORMAL: +0,11 ngày phải bốc');
  ok(await rolls(1, 0.07) === false, 'PASSIVE: +0,07 chưa bốc (tần suất PASSIVE 0,1)');
  ok(await rolls(1, 0.11) === true, 'PASSIVE: +0,11 phải bốc');
  // PASSIVE bỏ sự kiện không cho phép: Leviathan (allowInPassiveMode false) không nằm trong ứng viên theo test()
  const pas = await ev(page, () => { DRMenus.set('gameMode', 1); const r = DREvents.debug.test('PhantomShark'); DRMenus.set('gameMode', 0); return r; });
  ok(!pas.ok && pas.fails.includes('passive'), 'PASSIVE phải loại PhantomShark: ' + JSON.stringify(pas));
  await ev(page, () => DRMenus.set('gameMode', 0));

  // ---- 3. cài đặt (tác dụng thật)
  const fx = await ev(page, () => {
    const out = {};
    DRMenus.set('textSpeed', 2); out.tw2 = DRMenus.typewriterSpeed(); DRMenus.set('textSpeed', 0); out.tw0 = DRMenus.typewriterSpeed(); DRMenus.set('textSpeed', 1); out.tw1 = DRMenus.typewriterSpeed();
    DRMenus.set('clockStyle', 0); out.c12 = [DRMenus.fmtClock(13, 5), DRMenus.fmtClock(0, 7), DRMenus.fmtClock(12, 30), DRMenus.fmtClock(9, 0)];
    DRMenus.set('clockStyle', 1); out.c24 = DRMenus.fmtClock(13, 5);
    DRMenus.set('units', 1); out.ft = [DRMenus.sizeImperial(100), DRMenus.sizeImperial(20), DRMenus.depthFt(10, ''), DRMenus.depthFt(10, ' ')];
    DRMenus.set('units', 0); out.m = [DRMenus.sizeImperial(100), DRMenus.depthFt(10, '')];
    out.cam0 = DRCamera.sensFactors();
    DRMenus.set('cameraInvertX', 1); DRMenus.set('cameraSensitivityY', 0.25); out.cam1 = DRCamera.sensFactors();
    DRMenus.set('cameraInvertX', 0); DRMenus.set('cameraSensitivityY', 0.5);
    DRMenus.set('masterVolume', 0.4); DRMenus.set('musicVolume', 0.3); DRMenus.set('sfxVolume', 0.2); DRMenus.set('uiVolume', 0.1); DRMenus.set('voiceVolume', 0.6);
    out.vol = DRAudio.volumes();
    return out;
  });
  ok(fx.tw2 === 2 && fx.tw0 === 0.5 && fx.tw1 === 1, 'typewriterSpeed: ' + JSON.stringify([fx.tw0, fx.tw1, fx.tw2]));
  ok(fx.c12.join('|') === '1:05 PM|12:07 AM|12:30 PM|9:00 AM' && fx.c24 === '13:05', 'fmtClock: ' + JSON.stringify([fx.c12, fx.c24]));
  ok(fx.ft[0] === '3\' 3"' && fx.ft[1] === '7.9"' && fx.ft[2] === '32ft' && fx.ft[3] === '32 ft' && fx.m[0] === null && fx.m[1] === null, 'units: ' + JSON.stringify([fx.ft, fx.m]));
  ok(fx.cam0.x === 1 && fx.cam0.y === 1 && fx.cam1.x === -1 && fx.cam1.y === 0.5, 'camera: ' + JSON.stringify([fx.cam0, fx.cam1]));
  ok(JSON.stringify(fx.vol) === JSON.stringify({ master: 0.4, music: 0.3, sfx: 0.2, ui: 0.1, voice: 0.6 }), 'DRAudio volumes: ' + JSON.stringify(fx.vol));
  // đồng hồ HUD đọc kiểu đồng hồ (hud.js)
  await ev(page, () => { if (DR.mode === 'dock') DRDock && DRDock.undock && 0; DRMenus.set('clockStyle', 0); });
  await sleep(500);
  ok(await ev(page, () => /\b\d{1,2}:\d\d (AM|PM)\b/.test(document.body.innerText)), 'HUD không hiện đồng hồ 12 giờ');
  await ev(page, () => DRMenus.set('clockStyle', 1));
  await sleep(300);
  ok(await ev(page, () => !/\b\d{1,2}:\d\d (AM|PM)\b/.test(document.body.innerText)), 'HUD vẫn hiện AM/PM sau khi về 24 giờ');
  await ev(page, () => DRMenus.reset());

  // cài đặt từ màn tạm dừng + Esc chỉ đóng cửa sổ
  await page.keyboard.press('Escape');
  await page.waitForSelector('#dr-pause:not([hidden])', { timeout: 4000 });
  await page.click('#btn-pause-settings');
  await page.waitForSelector('.dm-win.settings', { state: 'visible', timeout: 3000 });
  await page.click('.dm-tab[data-tab="audio"]');
  await page.fill('#dm-musicVolume', '0.35');
  await page.dispatchEvent('#dm-musicVolume', 'input');
  ok(await ev(page, () => DRMenus.get('musicVolume')) === 0.35 && await ev(page, () => DRAudio.volumes().music) === 0.35, 'thanh trượt Nhạc không đổi âm lượng');
  await page.click('.dm-tab[data-tab="game"]');
  await page.click('.dm-row[data-key="gameMode"] button[data-v="2"]');
  ok(await ev(page, () => DREvents.gameMode) === 'NIGHTMARE', 'nút Ác mộng không đổi DREvents');
  ok(/0,05|0.05/.test(await page.textContent('.dm-row[data-key="gameMode"] .note')), 'ghi chú chế độ');
  await page.screenshot({ path: path.join(OUT, 'settings-pause-1280.png') });
  await page.keyboard.press('Escape');
  await sleep(250);
  ok(!(await ev(page, () => DRMenus.settingsOpen)), 'Esc không đóng cửa sổ cài đặt');
  ok(await page.isVisible('#dr-pause'), 'Esc đóng cửa sổ cài đặt nhưng không được đóng luôn màn tạm dừng');
  await page.click('#btn-resume');
  // lưu qua lần tải lại
  await ev(page, () => { DRMenus.set('gameMode', 1); DRMenus.set('units', 1); });
  await boot('');
  const kept = await ev(page, () => ({ gm: DRMenus.get('gameMode'), mode: DREvents.gameMode, units: DRMenus.get('units'), music: DRMenus.get('musicVolume'), vol: DRAudio.volumes().music }));
  ok(kept.gm === 1 && kept.mode === 'PASSIVE' && kept.units === 1 && kept.music === 0.35 && kept.vol === 0.35, 'cài đặt không sống sót qua tải lại: ' + JSON.stringify(kept));
  // từ màn tiêu đề
  await page.click('#btn-settings');
  await page.waitForSelector('.dm-win.settings', { state: 'visible', timeout: 3000 });
  ok(await ev(page, () => DRMenus.settingsOpen), 'nút Cài đặt ở màn tiêu đề không mở cửa sổ');
  await page.click('.dm-tab[data-tab="display"]');
  await page.screenshot({ path: path.join(OUT, 'settings-title-1280.png') });
  await page.click('.dm-foot [data-act="reset"]');
  ok(await ev(page, () => DRMenus.get('gameMode') === 0 && DRMenus.get('units') === 0 && DRMenus.get('musicVolume') === 1 && DRMenus.get('lastSaveSlot') === 1), 'Khôi phục mặc định sai (phải giữ lastSaveSlot)');
  await page.click('.dm-foot [data-act="back"]');
  ok(!(await ev(page, () => DRMenus.settingsOpen)), 'Quay lại không đóng cài đặt');

  // ---- 4. xoá ô có hỏi lại
  await page.click('#btn-continue');
  await page.waitForSelector('.dm-win.slots', { state: 'visible', timeout: 3000 });
  await page.click('.dm-slot[data-slot="0"] [data-act="delete"]');
  ok(await page.isVisible('.dm-confirm'), 'xoá ô phải hỏi lại');
  await page.click('.dm-confirm [data-act="cancel-delete"]');
  ok(await ev(page, () => !!localStorage.getItem('dredge.save.v1')), 'Giữ lại mà ô 1 vẫn bị xoá');
  await page.click('.dm-slot[data-slot="0"] [data-act="delete"]');
  await page.click('.dm-confirm [data-act="confirm-delete"]');
  ok(await ev(page, () => !localStorage.getItem('dredge.save.v1') && !!localStorage.getItem('dredge.save.v1.s1')), 'xoá ô 1 phải bỏ khoá ô 1 và giữ ô 2');
  ok(await page.isVisible('.dm-slot[data-slot="0"].empty'), 'ô 1 sau khi xoá phải thành trống');
  await page.keyboard.press('Escape');
  ok(!(await ev(page, () => DRMenus.slots.isOpen)), 'Esc không đóng cửa sổ ô lưu');
  ok(await page.isVisible('#dr-title'), 'màn tiêu đề phải còn');

  // ---- 5. credits
  await page.click('#btn-credits');
  await page.waitForSelector('#dr-credits:not([hidden])', { timeout: 3000 });
  ok(await ev(page, () => DRMenus.credits.playing), 'Giới thiệu không chạy credits');
  await sleep(3600);
  await page.screenshot({ path: path.join(OUT, 'credits-short-1280.png') });
  await ev(page, () => { DRMenus.credits.state.t = 8.8; });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'credits-music-1280.png') });
  await ev(page, () => { DRMenus.credits.state.t = 12; DRMenus.credits.state.scroll = DRMenus.credits.state.sec * 0.02; });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'credits-roll-1280.png') });
  await ev(page, () => { const s = DRMenus.credits.state; s.t = 12; s.scroll = s.sec * 0.55; });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'credits-grid-1280.png') });
  const cinfo = await ev(page, () => { const s = DRMenus.credits.state; return { sec: s.sec, total: s.total, H: s.H, scale: s.s }; });
  // tốc độ: sec = (pageH + H) / s / 100 giây
  ok(Math.abs(cinfo.sec - (cinfo.total / cinfo.scale) / 100) < 1e-6 && cinfo.sec > 100, 'thời gian cuộn: ' + JSON.stringify(cinfo));
  await ev(page, () => { DRMenus.credits.timeScale = 400; });
  await page.waitForFunction(() => !DRMenus.credits.playing, null, { timeout: 30000 });
  ok(await page.isHidden('#dr-credits'), 'credits xong mà lớp phủ chưa ẩn');
  ok(await page.isVisible('#dr-title') && await ev(page, () => DR.mode) === 'title', 'credits xong phải về màn tiêu đề');
  // giữ Esc 1 s
  await ev(page, () => { DRMenus.credits.timeScale = 1; });
  await page.click('#btn-credits');
  await page.waitForSelector('#dr-credits:not([hidden])', { timeout: 3000 });
  await sleep(1500);
  await page.keyboard.down('Escape'); await sleep(450);
  ok(await ev(page, () => DRMenus.credits.playing), 'nhả sớm hơn 1 s thì credits phải còn');
  await page.keyboard.up('Escape'); await sleep(200);
  await page.keyboard.down('Escape'); await sleep(1500); await page.keyboard.up('Escape');
  ok(!(await ev(page, () => DRMenus.credits.playing)), 'giữ Esc 1 s phải bỏ qua credits');
  // trong ván: kết thúc → về title
  await page.click('#btn-continue');
  await page.waitForSelector('.dm-win.slots', { state: 'visible', timeout: 3000 }).catch(() => {});
  if (await ev(page, () => DRMenus.slots.isOpen)) await page.click('.dm-slot[data-slot="1"] [data-act="load"]');
  await enterGame(page);
  const ended = await ev(page, () => new Promise(res => { let mode = null; DRMenus.credits.timeScale = 800; DRMenus.credits.play({ mode: 'game', onEnd: m => { mode = m; } }); const t0 = performance.now(); const iv = setInterval(() => { if (!DRMenus.credits.playing || performance.now() - t0 > 30000) { clearInterval(iv); res({ mode, dm: DR.mode }); } }, 100); }));
  ok(ended.mode === 'game' && ended.dm === 'title', 'credits trong ván phải về title: ' + JSON.stringify(ended));

  // ---- 6. 844x390
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  await page.click('#btn-settings');
  await page.waitForSelector('.dm-win.settings', { state: 'visible' });
  await page.click('.dm-tab[data-tab="game"]');
  await page.screenshot({ path: path.join(OUT, 'settings-844.png') });
  const fit = await ev(page, () => { const r = document.querySelector('.dm-win.settings').getBoundingClientRect(); return { b: r.bottom, h: innerHeight, w: r.right, W: innerWidth }; });
  ok(fit.b <= fit.h + 1 && fit.w <= fit.W + 1, 'cài đặt tràn khung 844x390: ' + JSON.stringify(fit));
  await page.keyboard.press('Escape');
  await ev(page, () => localStorage.setItem('dredge.save.v1', localStorage.getItem('dredge.save.v1.s1')));   // hai ô có sổ để Tiếp tục hỏi ô
  await page.click('#btn-continue');
  await page.waitForSelector('.dm-win.slots', { state: 'visible', timeout: 3000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, 'slots-844.png') });
  if (await ev(page, () => DRMenus.slots.isOpen)) {
    const f2 = await ev(page, () => { const r = document.querySelector('.dm-win.slots').getBoundingClientRect(); return { b: r.bottom, h: innerHeight }; });
    ok(f2.b <= f2.h + 1, 'ô lưu tràn khung 844x390: ' + JSON.stringify(f2));
    await page.keyboard.press('Escape');
  } else await page.screenshot({ path: path.join(OUT, 'slots-844.png') });
  await ev(page, () => { DRMenus.credits.timeScale = 1; });
  await page.click('#btn-credits');
  await page.waitForSelector('#dr-credits:not([hidden])');
  await sleep(3600);
  await page.screenshot({ path: path.join(OUT, 'credits-short-844.png') });
  await ev(page, () => { const s = DRMenus.credits.state; s.t = 12; s.scroll = s.sec * 0.55; });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'credits-grid-844.png') });
  await ev(page, () => DRMenus.credits.stop());

  ok(!errors.length, 'lỗi trang: ' + errors.slice(0, 5).join(' | '));
  console.log(`dredge-w7menus: ${pass} ok, ${fail} fail   shots: ${OUT}`);
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
