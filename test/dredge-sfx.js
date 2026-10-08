/*
 * DREDGE — Biển Mù: kiểm tiếng (round 2, chủ sfx). Playwright + chuột/phím thật, không gọi hàm nội bộ để "làm giả" kết quả.
 *
 * Chạy:  node test/dredge-sfx.js         (tự dựng máy chủ tĩnh ở gốc repo; DR_URL=... để chạy trên Pages)
 * Gián điệp WebAudio: addInitScript bọc AudioBufferSourceNode.prototype.start, ghi mọi nút nguồn được phát cùng KHOÁ của nó
 * (js/audio.js đánh dấu buffer._drKey / src._drKey / src._drVol / src._drBus). Mọi khẳng định là số lấy từ bản gốc (ghi nguồn bên cạnh).
 * Ảnh ra %TEMP%/dredge-sfx. Phần cứng thật không cần: Chromium chạy với --autoplay-policy=no-user-gesture-required.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games/dredge');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-sfx');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const close = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-4 : e);

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

// ---- gián điệp WebAudio (chạy trước mọi script của trang)
const SPY = () => {
  window.__sfx = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__sfx.push({ t: performance.now(), key: this._drKey || (this.buffer && this.buffer._drKey) || null, loop: this.loop, vol: this._drVol == null ? null : this._drVol,
      bus: this._drBus || null, rate: this.playbackRate.value });
    return start.apply(this, a);
  };
};

// ---- đọc số từ tệp dữ liệu (không nhờ trình duyệt): DR_AUDIO, DR_SFX
function loadData(file, varName) {
  const vm = require('vm'), box = { console }; box.window = box; vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(GAME, file), 'utf8'), box);
  return box[varName];
}
const AUDIO = loadData('data/audio.js', 'DR_AUDIO'), SFX = loadData('data/sfx.js', 'DR_SFX');

async function run(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.addInitScript(SPY);
  const ev = fn => page.evaluate(fn);
  const spy = () => page.evaluate(() => window.__sfx.slice());
  const mark = () => page.evaluate(() => window.__sfx.length);
  const since = async n => (await spy()).slice(n);
  const keysSince = async n => (await since(n)).map(e => e.key);
  const state = () => page.evaluate(() => DRAudio.state());
  const dbg = () => page.evaluate(() => DRSfx.debug());
  // chờ một nút nguồn khớp biểu thức, CHỈ tính các lần phát từ mốc `from` (mark()) trở đi: nếu tính cả lịch sử thì lần phát cũ làm hàm trả về ngay
  const waitStart = (pred, ms, from) => page.waitForFunction(a => window.__sfx.slice(a.from).some(new Function('e', 'return ' + a.pred)), { pred, from: from || 0 }, { timeout: ms || 6000 }).then(() => true, () => false);

  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await sleep(500);

  // ======================================================== dữ liệu: tên gốc mà chủ khác gọi đều phải ra khoá
  const names = {
    'tiếng gần điểm câu (HarvestPOIHandler 6 loại × 3)': ['Small Fish', 'Medium Fish', 'Large Fish', 'Trinkets', 'Material', 'Relic'].flatMap(c => [1, 2, 3].map(i => `Harvest Spot - ${c} ${i}`)),
    'banner (BannerUI) + thông báo': ['Fish - New', 'Fish - New Aberration', 'Notification - Generic', 'Research - Complete', 'Book - Complete', 'Book - Added', 'Money - Gained', 'Money - Spent'],
    'lưới hàng (GridObjectAudio + 15 ghi đè)': ['Equipment - Install', 'Equipment - Uninstall', 'Trinket Item - Pickup', 'Trinket Item - Place', 'Trinket Item - Discard', 'Aberration - Pick up',
      'Organic Item - Pick up', 'Organic Item - Place', 'Organic Item - Drop', 'Inorganic Item - Pick up', 'Inorganic Item - Place', 'Inorganic Item - Drop', 'Person - Pickup', 'Person - Place',
      'Dog - Pick Up 1', 'Dog - Pick Up 2', 'Dog - Pick Up 3', 'Relic Key Pickup', 'Relic Key Place', 'Relic Musicbox Pickup', 'Relic Musicbox Place', 'Relic Ring Pickup', 'Relic Ring Place',
      'Relic Necklace Pickup', 'Relic Necklance Place', 'Relic Pocketwatch Pickup', 'Relic Pocketwatch Place', 'Ice Stone - Pick up', 'Ice Stone - Place',
      'Dark Splash-001', 'Dark Splash-002', 'Dark Splash-003', 'Repair Kit', 'Sanity Kit', 'Crabpot Kit', 'item-place-error', 'rotate'],
    'năng lực': ['foghorn-loop', 'foghorn-end', 'Advanced Foghorn Ability', 'Advanced Foghorn Ping', 'Haste - Kickoff', 'Haste - Loop', 'Haste - Engine Explosion', 'Haste - Overheat Loop',
      'Spyglass - Extend', 'Spyglass - Retract', 'Advanced Spyglass Extend', 'Advanced Spyglass Retract', 'Radial Menu - Appear', 'Radial Menu - Select', 'Radial Menu - Disappear',
      'light-on', 'light-off', 'Advanced Lights On', 'Advanced Lights Off', 'Banish - Snuff Only', 'Banish - No Snuff', 'Atrophy - Cast', 'Atrophy - Loop', 'Manifest',
      'Camera Ability - Open_1', 'Camera Ability - Close_1', 'Camera Ability - Capture 1_1', 'Camera Ability - Capture 2_1', 'Camera Ability - Capture 3_1', 'Cast Ability - Bait', 'Crab Pot - Deploy'],
    'nâng cấp + vào điểm đến (SU-14)': ['Upgrade - Complete', 'Fishmonger - Visit', 'Shipwright - Visit', 'Dry Dock - Visit', 'Travelling Merchant - Visit', 'Collector - Visit', 'Painter - Visit',
      'Trader - Visit', 'Researcher - Visit', 'Research - Visit', 'Storage - Visit', 'Explosives Shop - Visit'],
    'thời tiết, sét, sấm': ['Light Rain 1', 'Normal Rain 1', 'Heavy Rain 1', 'Windy', 'Light Snow', 'Heavy Snow', 'Aurora', 'Lightning_1', 'Lightning_2', 'Lightning_3', 'Thunder 1', 'Thunder 2', 'Thunder 3'],
    'cửa sổ (SFX-11)': ['Pursuits - Open', 'Pursuits - Close', 'Pursuits - Open Individual', 'Pursuits - Close Individual', 'Map - Open', 'Map - Close', 'Messages - Open', 'Messages - Close',
      'Messages - Open Individual', 'Messages - Close Individual', 'Encyclopedia - Turn Page 3', 'Generic Grid Open Sound'],
    '26 clip Yarn (SFX-14)': ['generator-startup', 'generator-ambience', 'fishmonger-door-slam', 'collector-page-turn', 'collector-ability-unlock', 'mirror-shatter', 'tir-leviathan-roar',
      'Frozen_Soul_Smash', 'Ice_Shaper_Cut', 'beacon-activated', 'beacon-unactivated', 'mystical-fire-ignite', 'mystical-fire-loop', 'cultist-ambience', 'lighthouse-sweep', 'Adjust_Bunting_Off',
      'Adjust_Bunting_On', 'Paint_Boat', 'Grind_Crabs', 'Change_Flag', 'scientist-reveal', 'scientist-loop', 'scientist-crunch', 'scientist-screech', 'Bait_Mixed', 'airman-ambience'],
    'hoảng loạn + tiền': ['Insanity Ambience 1', 'Insanity Ambience 2', 'Insanity Ambience 3', 'Insanity Ambience 4', 'item-sold-1', 'item-sold-2', 'item-sold-3', 'Item-bought-1', 'select', 'submit', 'click-back']
  };
  for (const [grp, list] of Object.entries(names)) {
    const bad = await page.evaluate(l => l.filter(n => !DRAudio.resolve(n)), list);
    check('tên gốc ra khoá phát — ' + grp + ' (' + list.length + ')', bad.length === 0, bad.join(' | '));
  }
  const miss = await page.evaluate(() => {
    const s = DR_SFX, bad = [];
    for (const z of Object.values(s.stingers.zones)) for (const c of z) if (c && !DRAudio.resolve(c)) bad.push(c);
    return bad;
  });
  check('nhạc chớp: mọi clip của 5 vùng game gốc có trong bản web (Pale Reach là DLC1, chỉ báo)', miss.every(c => /Pale Reach/.test(c)) && miss.length <= 7, miss.length + ' clip thiếu: ' + miss.slice(0, 8).join(', '));
  const sea = await page.evaluate(() => ['ambience.sea', 'ambience.seagulls'].filter(k => DR_AUDIO[k]));
  check('vòng biển liên tục (Waves Ambience 1) và mòng biển gần đất không còn: không có trong bản gốc', sea.length === 0, sea.join(','));
  const al = await page.evaluate(() => ['ui.journal.open', 'ui.journal.close', 'ui.journal.page.1'].map(k => DRAudio.resolve(k)));
  check('SFX-11: khoá cũ của hud.js trỏ sang Pursuits - Open / Close / Open Individual', al.join() === 'ui.pursuits.open,ui.pursuits.close,ui.pursuits.open.one', al.join());

  // ======================================================== SFX-04: nút bấm trên màn đầu, bằng chuột thật
  await page.keyboard.press('Shift');   // cú chạm đầu mở WebAudio (luật autoplay); không phải hành động của game
  await sleep(300);
  let n0 = await mark();
  await page.hover('#btn-new');
  await sleep(600);
  let ks = await keysSince(n0);
  check('rê chuột vào nút "Ván mới": đúng một tiếng select (BasicButtonWrapper.OnPointerEnter)', ks.filter(k => k === 'ui.button.select').length === 1, JSON.stringify(ks));
  await page.screenshot({ path: path.join(SHOTS, '1-title-hover.png') });

  // ======================================================== vào ván mới ở Greater Marrow: bến
  n0 = await mark();
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await sleep(1500);
  ks = await keysSince(n0);
  check('bấm "Ván mới": một submit, không có select thừa sau cú bấm', ks.filter(k => k === 'ui.button.submit').length === 1 && ks.filter(k => k === 'ui.button.select').length === 0, JSON.stringify(ks.filter(k => /ui\.button/.test(k))));
  let st = await state();
  check('màn mở đầu ván mới đang chạy: nhạc bến nhường chỗ (intro.js gọi music(null))', st.music === null && !!st.loops['intro.opening'], String(st.music));
  await ev(() => window.DRIntro && DRIntro.skip());   // bỏ qua màn mở đầu như người chơi bấm Space
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 15000 });
  await sleep(1500);
  st = await state();
  check('xong phần mở đầu: nhạc bến = Greater Marrow Dock Theme (DockAudio.RefreshDockAudio)', st.music === 'music.dock.greaterMarrow', st.music);
  const day = SFX.blend.day, night = SFX.blend.night;
  const ev0 = (c, t) => { // Hermite của Unity với tiếp tuyến 0 (smoothstep) ở các đoạn dốc
    const k = c, n = k.length;
    if (t <= k[0][0]) return k[0][1]; if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0; while (i < n - 2 && t > k[i + 1][0]) i++;
    const a = k[i], b = k[i + 1], u = (t - a[0]) / (b[0] - a[0]);
    return a[1] + (b[1] - a[1]) * (3 * u * u - 2 * u * u * u);
  };
  await ev(() => DR_DEBUG.setTime(0.4));
  await sleep(1300);
  st = await state();
  check('ban ngày (giờ 0,4): tiếng nền bến ban ngày bật, bus Day 1 / Night 0,001 (TimeOfDayAudioBlender: max(0,001, đường cong))',
    st.loops['dock.greaterMarrow.day'] && close(st.loops['dock.greaterMarrow.day'].target, 0.5) && close(st.buses.Day, ev0(day, 0.4), 1e-3) && close(st.buses.Night, 0.001, 1e-3),
    JSON.stringify({ day: st.loops['dock.greaterMarrow.day'], Day: st.buses.Day, Night: st.buses.Night }));
  await ev(() => DR_DEBUG.setTime(0.9));
  await sleep(1800);
  st = await state();
  check('ban đêm (giờ 0,9): bus Night 1 / Day 0,001', close(st.buses.Night, 1, 1e-3) && close(st.buses.Day, 0.001, 1e-3), 'Day ' + st.buses.Day + ' Night ' + st.buses.Night);
  check('bến: snapshot DOCKED_OUTDOORS → bus DayDockAmbience/NightDockAmbience mở (0 dB), Music_Dock -5 dB',
    close(st.buses.NightDockAmbience, 1, 0.02) && close(st.buses.Music_Dock, Math.pow(10, -5 / 20), 0.01), JSON.stringify({ n: st.buses.NightDockAmbience, m: st.buses.Music_Dock }));
  await ev(() => DR_DEBUG.setTime(0.4));

  // ---- nút của bến: rê = select, bấm = submit, không phát đôi (dock.js còn tự phát select trong onclick)
  // Hội thoại đầu của bến (Mayor_Intro_0...) chưa xong nên giao diện bến chưa dựng và ván mới chưa mở điểm đến/nhân vật nào. Mở sẵn một điểm đến
  // và một nhân vật rồi dừng Runner Yarn (đúng đường của dock.js: DRDialogue onEnd → showUi); từ đây dùng chuột thật.
  await ev(() => {
    const sv = DRYarn.ensure();
    if (!sv.availableDestinations.includes('destination.gm-fishmonger')) sv.availableDestinations.push('destination.gm-fishmonger');
    if (!sv.availableSpeakers.includes('Builder')) sv.availableSpeakers.push('Builder');
    const r = DRYarn.current();
    if (r) r.stop();
  });
  await page.waitForFunction(() => DRDock._debug() && DRDock._debug().phase === 'ui', null, { timeout: 8000 }).catch(() => {});
  await sleep(1800);   // nút nhân vật trượt vào sau animationDelay 0,7 s + 0,2 s mỗi nút
  // toạ độ giữa nút nếu nút nằm trọn trong màn và không bị lớp khác đè (chuột thật phải chạm đúng nút)
  const centre = sel => page.evaluate(s => {
    for (const b of document.querySelectorAll(s)) {
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (r.width < 8 || r.height < 8 || x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && top.closest('button') === b) return { x, y };
    }
    return null;
  }, sel);
  const dkNow = await ev(() => DRDock._debug());
  const cDest = await centre('#dr-dockui .dk-dest'), cSpk = await centre('#dr-dockui .dk-speaker');
  check('giao diện bến dựng xong: có nút điểm đến + nút nhân vật để thử', !!cDest && !!cSpk, JSON.stringify({ dkNow, cDest, cSpk }));
  if (cDest && cSpk) {
    await page.mouse.move(640, 20);
    await sleep(250);
    n0 = await mark();
    await page.mouse.move(cDest.x, cDest.y);
    await sleep(500);
    ks = await keysSince(n0);
    check('rê chuột vào nút điểm đến của bến: đúng một select', ks.filter(k => k === 'ui.button.select').length === 1 && ks.filter(k => /^ui\.button\./.test(k)).length === 1, JSON.stringify(ks));
    await page.screenshot({ path: path.join(SHOTS, '2-dock-hover.png') });
    await page.mouse.move(640, 20);
    await sleep(250);
    n0 = await mark();
    await page.mouse.move(cSpk.x, cSpk.y);
    await sleep(500);
    ks = await keysSince(n0);
    check('rê chuột vào nút nhân vật của bến: đúng một select', ks.filter(k => k === 'ui.button.select').length === 1 && ks.filter(k => /^ui\.button\./.test(k)).length === 1, JSON.stringify(ks));
    n0 = await mark();
    await page.mouse.down(); await page.mouse.up();
    await sleep(900);
    ks = await keysSince(n0);
    check('bấm nút nhân vật: đúng một submit, không select (chặn tiếng select mà dock.js tự gọi trong onclick)', ks.filter(k => k === 'ui.button.submit').length === 1 && ks.filter(k => k === 'ui.button.select').length === 0, JSON.stringify(ks.filter(k => /ui\.button/.test(k))));
    const talking = await ev(() => DRDialogue.isOpen());
    check('bấm nút nhân vật thật sự mở hội thoại (không bấm trượt)', talking === true);
    await ev(() => { const r = DRYarn.current(); if (r) r.stop(); });   // hết hội thoại: dock.js dựng lại nút
    await page.waitForFunction(() => DRDock._debug() && DRDock._debug().phase === 'ui', null, { timeout: 8000 }).catch(() => {});
    // nút "Rời bến" của thuyền: rê = select, bấm = click-back (BasicButtonWrapper kiểu back); dock.js tự phát back nên không được phát đôi
    await sleep(300);
    const cOut = await centre('#dr-dockui .dk-boat .sub[data-act="undock"]');
    check('có nút Rời bến để thử', !!cOut, JSON.stringify(cOut));
    if (cOut) {
      await page.mouse.move(640, 20);
      await sleep(250);
      n0 = await mark();
      await page.mouse.move(cOut.x, cOut.y);
      await sleep(500);
      ks = await keysSince(n0);
      check('rê chuột vào nút Rời bến: đúng một select', ks.filter(k => k === 'ui.button.select').length === 1, JSON.stringify(ks));
      n0 = await mark();
      await page.mouse.down(); await page.mouse.up();
      await sleep(900);
      ks = await keysSince(n0);
      check('bấm Rời bến: đúng một click-back (back), không select/submit thừa', ks.filter(k => k === 'ui.button.back').length === 1 && ks.filter(k => k === 'ui.button.select' || k === 'ui.button.submit').length === 0, JSON.stringify(ks.filter(k => /ui\.button/.test(k))));
      await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 8000 }).catch(() => {});
      check('bấm Rời bến: thuyền ra khơi (chế độ sail)', (await ev(() => DR.mode)) === 'sail', await ev(() => DR.mode));
    }
  }
  await ev(() => { document.querySelectorAll('.dk-win.on').forEach(e => e.classList.remove('on')); });

  // ======================================================== SFX-09: tiền
  await ev(() => DR.setMode('dock') || 1);
  n0 = await mark();
  await ev(() => DR.addFunds(25));
  await sleep(900);
  ks = await keysSince(n0);
  const sold = ks.filter(k => /^ui\.sell\.[123]$/.test(k));
  check('thu tiền (+25): đúng một trong item-sold-1/2/3 (FundsChangeAudio.increaseClips)', sold.length === 1 && ks.filter(k => /^ui\.sell/.test(k)).length === 1, JSON.stringify(ks));
  n0 = await mark();
  await ev(() => DR.addFunds(-5));
  await sleep(900);
  ks = await keysSince(n0);
  check('chi tiền (−5): Item-bought-1 (FundsChangeAudio.decreaseClips)', ks.filter(k => k === 'ui.buy').length === 1 && ks.length === 1, JSON.stringify(ks));
  n0 = await mark();
  await ev(() => { DR.addFunds(12); DRAudio.play('ui.sell'); DRAudio.play('ui.buy'); });   // y như js/dock.js: addFunds rồi tự phát ui.sell
  await sleep(900);
  ks = await keysSince(n0);
  check('dock.js phát thêm ui.sell sau addFunds: chỉ nghe một tiếng', ks.filter(k => /^ui\.(sell|buy)/.test(k)).length === 1, JSON.stringify(ks));
  const seen = new Set();
  for (let i = 0; i < 24; i++) { n0 = await mark(); await ev(() => DR.addFunds(1)); await sleep(330); (await keysSince(n0)).forEach(k => seen.add(k)); }
  check('24 lần thu tiền: cả ba clip item-sold-1/2/3 đều xuất hiện (chọn ngẫu nhiên)', ['ui.sell.1', 'ui.sell.2', 'ui.sell.3'].every(k => seen.has(k)), [...seen].join(','));

  // ======================================================== ra khơi: vào nhịp ngoài biển
  await ev(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 15000 });
  n0 = await mark();
  await sleep(2500);
  st = await state();
  check('SFX-13: vào ra khơi, nạp trước ≥ 40 clip nút/lưới/câu cá', st.buffers >= 40 && (await dbg()).snap === 'UNDOCKED', st.buffers + ' buffer, snapshot ' + (await dbg()).snap);
  check('ngoài khơi: nhạc bến tắt (RequestMusicStop)', st.music === null, String(st.music));
  const everSea = (await spy()).filter(e => /^ambience\.(sea|seagulls)$/.test(e.key || ''));
  check('không còn vòng biển liên tục / mòng biển trong chuỗi phát', everSea.length === 0);

  // ======================================================== SFX-12: hoảng loạn
  await ev(() => { DR_DEBUG.setTime(0.4); DR.s.sanity = 0.3; });
  await sleep(1400);
  st = await state();
  const L = i => st.loops['music.insanity.' + i];
  const vk = AUDIO['music.insanity.1'].vol;   // hệ số khoá = 0,5 (thay Master -9 dB)
  // InsanityAmbience.cs:58-64, giá trị = 1 − 0,3 = 0,7: [InverseLerp(0,0.25)=1, (0,0.5)=1, (0.25,0.75)=0.9, (0.5,1)=0.4]
  check('sanity 0,3: bốn lớp có âm lượng 1 / 1 / 0,9 / 0,4 (× hệ số khoá ' + vk + ')',
    L(1) && L(2) && L(3) && L(4) && close(L(1).target, 1 * vk) && close(L(2).target, 1 * vk) && close(L(3).target, 0.9 * vk) && close(L(4).target, 0.4 * vk),
    [1, 2, 3, 4].map(i => L(i) && L(i).target.toFixed(3)).join(' / '));
  check('bốn lớp phát trên bus InsanitySFX', [1, 2, 3, 4].every(i => L(i) && L(i).bus === 'InsanitySFX'));
  check('bus InsanitySFX theo tốc độ giảm sanity: đang không tụt thì rất nhỏ (log10(prop) × 20 dB)', st.buses.InsanitySFX < 0.15, String(st.buses.InsanitySFX));
  await ev(() => { DR.s.sanity = 1; });
  await sleep(1300);
  st = await state();
  check('sanity 1: các lớp tắt (âm lượng 0)', [1, 2, 3, 4].every(i => !st.loops['music.insanity.' + i] || st.loops['music.insanity.' + i].target === 0));

  // ======================================================== SFX-05: thời tiết
  const cases = [
    ['HeavyRain', null, 1, { 'weather.rain.heavy': 1 }, 'HeavyRain → Heavy Rain 1'],
    ['LightRain', null, 1, { 'weather.rain.light': 1 }, 'LightRain → Light Rain 1'],
    ['Cloudy', null, 1, { 'weather.wind': 1 }, 'Cloudy → Windy'],
    ['Fine', null, 1, {}, 'Fine: không tiếng (sfx null, sfxVolume 0)'],
    ['MediumRain', 'HeavyRain', 0.5, { 'weather.rain.normal': 0.25, 'weather.rain.heavy': 0.75 }, 'chuyển HeavyRain → MediumRain ở k 0,5: enter(0,5)=0,25 (đường cong t²), cũ 1 − 0,25'],
    ['MediumStorm', 'MediumRain', 0.5, { 'weather.rain.normal': 1 }, 'MediumRain → MediumStorm cùng clip: 0,25 + 0,75 = 1']
  ];
  for (const [cur, prev, k, want, label] of cases) {
    await ev(() => { if (window.DRSky) DRSky.weather = null; });
    await page.evaluate(([c, p, kk]) => { DRSky.weather = { cur: c, prev: p, k: kk }; }, [cur, prev, k]);
    await sleep(1500);
    st = await state();
    const w = (await dbg()).weather;
    const keys = Object.keys(want);
    const ok = keys.every(key => w[key] != null && close(w[key], want[key], 1e-3)) && Object.keys(w).every(key => key in want);
    const loopsOk = keys.every(key => st.loops[key] && close(st.loops[key].target, want[key] * AUDIO[key].vol, 1e-3));
    check('thời tiết ' + label, ok && loopsOk, JSON.stringify(w) + ' | loops ' + keys.map(key => st.loops[key] && st.loops[key].target.toFixed(3)).join(','));
  }
  await page.evaluate(() => { DRSky.weather = { cur: 'HeavyRain', prev: 'Clear', k: 1 }; });
  n0 = await mark();
  await sleep(1500);
  const wantKey = await page.evaluate(() => DRAudio.resolve((DR_WEATHER.HeavyRain.parameters.sfx) || DR_SFX.weather.HeavyRain));
  check('vòng mưa lớn phát đúng khoá của sfx của HeavyRain', wantKey === 'weather.rain.heavy' && (await state()).loops[wantKey] && (await state()).loops[wantKey].running, wantKey);
  check('vòng thời tiết phát qua bus Weather', (await state()).loops[wantKey].bus === 'Weather');

  // sét: Lightning.Emit — tiếng sét ngay, sấm sau khoảng cách × 0,005 s
  n0 = await mark();
  const t0 = Date.now();
  await ev(() => { const b = DR.s.boat; DR.emit('lightning', { x: b.x + 200, z: b.z, dist: 200 }); });
  await waitStart('e.key && /^weather\\.thunder\\./.test(e.key)', 4000, n0);
  const lt = await since(n0);
  const strike = lt.find(e => /^weather\.lightning\.[123]$/.test(e.key || '')), thunder = lt.find(e => /^weather\.thunder\.[123]$/.test(e.key || ''));
  check('sét: một Lightning_1..3 rồi Thunder 1..3 sau 200 m × 0,005 = 1,0 s', !!strike && !!thunder && thunder.t - strike.t > 800 && thunder.t - strike.t < 1500,
    strike && thunder ? (thunder.t - strike.t).toFixed(0) + ' ms' : JSON.stringify(lt.map(e => e.key)));
  check('sét và sấm phát qua bus Weather', strike && thunder && strike.bus === 'Weather' && thunder.bus === 'Weather');

  // ======================================================== SFX-06: nhạc chớp
  await ev(() => { DRSky.weather = { cur: 'Fine', prev: null, k: 1 }; DR_DEBUG.teleport(2, -6, 0); DR_DEBUG.setTime(0.4); DRAudio.stopStinger(0.1); });
  await sleep(1200);
  await ev(() => { DRAudio.stopStinger(0.1); DRSfx.stinger.played = 0; });   // sau 5 s ra khơi bản chớp đầu tiên có thể đã phát (đúng như gốc)
  await sleep(500);
  let dsg = await dbg();
  check('ra khơi: đồng hồ nhạc chớp chạy (canUpdate), vùng THE_MARROWS', dsg.stinger.canUpdate === true && (await ev(() => DR.view.zoneId)) === 'THE_MARROWS', JSON.stringify(dsg.stinger));
  const P = SFX.stingers.params;
  // ngoài cửa sổ giờ 0,25–0,6: kiểm xong thì đặt lại đồng hồ 5 s
  await ev(() => { DR_DEBUG.setTime(0.9); DRSfx.stinger.timeUntilNextCheck = 0; DRSfx.stinger.queued = false; });
  n0 = await mark();
  await sleep(1400);
  dsg = await dbg();
  check('giờ 0,9 (ngoài 0,25–0,6): không xếp hàng, đồng hồ đặt lại ' + P.check + ' s', !dsg.stinger.queued && dsg.stinger.timeUntilNextCheck > P.check - 2 && dsg.stinger.timeUntilNextCheck <= P.check && !(await keysSince(n0)).some(k => /^music\.stinger/.test(k || '')), JSON.stringify(dsg.stinger));
  await ev(() => { DR_DEBUG.setTime(0.4); DRSky.weather = { cur: 'HeavyRain', prev: null, k: 1 }; DRSfx.stinger.timeUntilNextCheck = 0; DRSfx.stinger.queued = false; });
  n0 = await mark();
  await sleep(1400);
  dsg = await dbg();
  check('HeavyRain (forbidStingers): không phát, đồng hồ đặt lại ' + P.check + ' s', !dsg.stinger.queued && dsg.stinger.timeUntilNextCheck > P.check - 2 && !(await keysSince(n0)).some(k => /^music\.stinger/.test(k || '')), JSON.stringify(dsg.stinger));
  await ev(() => { DRSky.weather = { cur: 'HeavyStorm', prev: null, k: 1 }; DRSfx.stinger.timeUntilNextCheck = 0; });
  n0 = await mark();
  await sleep(1400);
  check('HeavyStorm (forbidStingers): cũng không phát', !(await keysSince(n0)).some(k => /^music\.stinger/.test(k || '')));
  await ev(() => { DRSky.weather = { cur: 'Fine', prev: null, k: 1 }; DRSfx.stinger.timeUntilNextCheck = 0; DRSfx.stinger.queued = false; });
  n0 = await mark();
  const got = await waitStart('e.key && /^music\\.stinger\\.marrows\\.[1-6]$/.test(e.key)', 6000, n0);
  const sting = (await since(n0)).find(e => /^music\.stinger/.test(e.key || ''));
  dsg = await dbg();
  check('giờ 0,4 + thời tiết Fine: phát một nhạc chớp của vùng Marrows (6 bản)', got && !!sting && sting.loop === false && sting.bus === 'Music_Stinger', sting ? sting.key : JSON.stringify({ st: dsg.stinger, mode: await ev(() => DR.mode), zone: await ev(() => DR.view.zoneId), t: await ev(() => DR.s.time % 1), w: await ev(() => DRSky.weather), playing: (await state()).stinger }));
  check('sau khi phát: đồng hồ = assumedStingerDuration 60 + Random(60, 80) s', dsg.stinger.timeUntilNextCheck > 118 && dsg.stinger.timeUntilNextCheck <= 140 && dsg.stinger.played === 1, dsg.stinger.timeUntilNextCheck.toFixed(1) + ' s, đã phát ' + dsg.stinger.played);
  check('nhạc chớp chỉ là một bản một lúc', (await state()).stinger === (sting && sting.key));

  // ======================================================== SFX-08: nguồn tiếng vùng (Volume2D)
  await ev(() => DRAudio.stopStinger(0.2));
  const em = SFX.emitters.find(e => e.c === 'Marrows Undocked - General Ambience');
  await ev(() => { DRSky.weather = { cur: 'Fine', prev: null, k: 1 }; DR_DEBUG.setTime(0.4); });
  await page.evaluate(e => DR_DEBUG.teleport(e.x, e.z, 0), em);
  n0 = await mark();
  await sleep(2400);
  let es = (await since(n0)).filter(e => e.loop && e.bus === 'General');
  check('đứng trên nguồn Marrows General (closeDist ' + em.d[0] + ' m): có vòng lặp bus General, âm lượng = closeVolume ' + em.d[2], es.length >= 1 && es.some(e => /^region\.marrows\.general$/.test(e.key)) && es.every(e => close(e.vol, em.d[2] * AUDIO['region.marrows.general'].vol, 1e-3) || e.key !== 'region.marrows.general'),
    es.map(e => e.key + '@' + (e.vol == null ? '?' : e.vol.toFixed(3))).join(', '));
  check('ban ngày: nguồn Day phát, nguồn Night không phát', (await since(n0)).some(e => e.bus === 'Day') && !(await since(n0)).some(e => e.bus === 'Night'), (await since(n0)).map(e => e.bus).join(','));
  dsg = await dbg();
  check('số nguồn đang giữ > 0 và là nguồn gần thuyền (smartToggle dừng nguồn ngoài tầm)', dsg.emitters > 0 && dsg.emitters < 20, String(dsg.emitters));
  await ev(() => DR_DEBUG.setTime(0.9));
  n0 = await mark();
  await sleep(2400);
  check('ban đêm: nguồn Night phát (Wildlife Night), bus Night 1', (await since(n0)).some(e => e.bus === 'Night') && close((await state()).buses.Night, 1, 1e-2), (await since(n0)).map(e => e.key).join(','));
  await page.evaluate(() => DR_DEBUG.teleport(-3, 900, 0));   // ngoài khơi xa mọi nguồn
  await sleep(8500);
  dsg = await dbg();
  check('rời xa mọi nguồn: giải phóng hết (im lặng quá 6 s thì dừng)', dsg.emitters === 0, String(dsg.emitters));

  // ======================================================== tiếng vào điểm đến
  await ev(() => { DR_DEBUG.teleport(2, -6, 0); });
  n0 = await mark();
  await ev(() => DR.emit('destination', 'destination.gm-fishmonger', true));
  await sleep(1500);
  ks = await keysSince(n0);
  st = await state();
  check('vào điểm đến gm-fishmonger: phát Fishmonger - Visit + vòng Fishmonger Ambience (trong nhà)', ks.includes('dest.visit.fishmonger') && st.loops['dest.loop.fishmonger'] && st.loops['dest.loop.fishmonger'].bus === 'IndoorDestination', JSON.stringify(ks));
  await ev(() => DR.emit('destination', undefined, false));
  await sleep(1500);
  check('rời điểm đến: vòng nền tắt', (await state()).loops['dest.loop.fishmonger'] === undefined || (await state()).loops['dest.loop.fishmonger'].target === 0);

  // ======================================================== nhạc bến có ghi đè theo cốt truyện
  const ov = await page.evaluate(() => {
    const d = DRDocks.byId['dock.old-mayor-sb'];
    const before = d.music;
    DR.s.vars['old-mayor-available'] = true;
    const after = d.music;
    DR.s.vars['old-mayor-available'] = false;
    return { before, after, amb: DRDocks.ambience(d) };
  });
  check('nhạc bến Old Mayor: chưa có cờ old-mayor-available = Empty Theme, có cờ = Old Mayor\'s Theme', ov.before === 'music.dock.oldMayorEmpty' && ov.after === 'music.dock.oldMayor', JSON.stringify(ov));

  // ======================================================== không lỗi
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 6).join(' | '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try { await run(browser, base); } catch (e) { fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e)); }
  await browser.close();
  if (srv) srv.close();

  // ---- ngân sách: phần của chủ sfx (audio/ + data/audio.js + data/sfx.js + js/audio.js + js/sfx.js) so với bản trước vòng 2
  const sizeOf = d => { let t = 0; for (const f of fs.readdirSync(d, { withFileTypes: true })) t += f.isDirectory() ? sizeOf(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size; return t; };
  const mine = sizeOf(path.join(GAME, 'audio')) + ['data/audio.js', 'data/sfx.js', 'js/audio.js', 'js/sfx.js'].reduce((s, f) => s + fs.statSync(path.join(GAME, f)).size, 0);
  const BEFORE = 22894857 + 45563 + 5404;   // audio/ + data/audio.js + js/audio.js lúc bắt đầu vòng 2 (đo trước khi sửa)
  check('ngân sách: phần của chủ sfx thêm ≤ 10 MB so với trước vòng 2', mine - BEFORE <= 10e6, ((mine - BEFORE) / 1e6).toFixed(2) + ' MB (audio+data+js: ' + (mine / 1e6).toFixed(2) + ' MB)');
  check('games/dredge ≤ 90 MB', sizeOf(GAME) <= 90e6, (sizeOf(GAME) / 1e6).toFixed(2) + ' MB');

  console.log('DREDGE sfx — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
