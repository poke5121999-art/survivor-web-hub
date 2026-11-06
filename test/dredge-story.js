/*
 * DREDGE — Biển Mù: kiểm cốt truyện (W5) trên trang thật bằng Playwright.
 *   ván mới → màn mở đầu (cảnh minh hoạ, giữ Space bỏ qua) → máy quay hải đăng → Mayor_Intro_0 → nhiệm vụ "A Fresh Start"
 *   → rời bến, câu một con cá (DR_DEBUG.catchNow) → về bến: Mayor_Intro_1_Fish (nợ $50) → Người buôn cá: bán cá (trả nợ 15%)
 *   → Mayor_Intro_2 (nhận Research Part, mở Thợ đóng tàu) → Thợ đóng tàu: Shipwright_Visit_0 → nhiệm vụ xong.
 * Chạy:  node test/dredge-story.js            (tự dựng máy chủ tĩnh ở gốc repo)
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-story.js
 * Ảnh chụp: %TEMP%/dredge-story/ (intro-1-scene1, intro-2-morgan, intro-3-cinematic, dialogue-portrait, dialogue-options, dock, journal, market...).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-story');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const GM = 'dock.greater-marrow';

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

async function run(browser, base) {
  const W = 1280, H = 720;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [], infos = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
    if (m.type() === 'info' && /\[yarn\]/.test(m.text())) infos.push(m.text());
  });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const shot = name => page.screenshot({ path: path.join(SHOTS, name + '.png') });
  const ev = (f, a) => page.evaluate(f, a);

  // Đi hết một đoạn hội thoại bằng phím thật: Space bỏ máy chữ / sang dòng; lựa chọn thì bấm nút theo pick(options) → index.
  async function talk(pick, onState, maxSteps) {
    const seen = [];
    for (let i = 0; i < (maxSteps || 80); i++) {
      const s = await ev(() => window.DRDialogue && DRDialogue.state());
      if (!s) {
        // dòng cuối đã qua: hội thoại có thể còn đợi một lệnh (PassTime, lưới nhiệm vụ)
        await sleep(300);
        if (!(await ev(() => window.DRDialogue && DRDialogue.isOpen()))) return seen;
        continue;
      }
      if (onState) await onState(s, seen);
      if (s.kind === 'options') {
        seen.push({ node: s.node, options: s.options.map(o => o.text) });
        const idx = pick ? pick(s.options, s.node) : s.options.find(o => o.available).index;
        await sleep(800);   // nút chỉ bấm được sau 0,75 s
        await page.click('.dlg-opt[data-index="' + idx + '"]');
        await sleep(300);
        continue;
      }
      if (s.kind === 'line' || s.kind === 'held') {
        if (!seen.length || seen[seen.length - 1].text !== s.text) seen.push({ node: s.node, name: s.name, text: s.text, prefab: s.prefab });
        if (s.kind === 'held') { await sleep(200); continue; }
        await page.keyboard.press('Space');
        await sleep(s.typing ? 650 : 600);
        continue;
      }
      // lưới nhiệm vụ đang mở
      const grid = await ev(() => !!document.querySelector('#dr-dlg .sg-panel'));
      if (grid) return seen;
      await sleep(250);
    }
    return seen;
  }

  // ---- màn đầu → ván mới
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await ev(() => { window.__quest = []; DR.on('quest', e => window.__quest.push(e)); window.__nodes = []; DR.on('nodeStart', n => window.__nodes.push(n)); });
  const perf0 = await ev(() => DR_DEBUG.perf());
  await page.click('#btn-new');
  await page.waitForFunction(() => window.DRIntro && DRIntro.stage === 'illustrated', null, { timeout: 5000 }).catch(() => {});
  check('ván mới: phát cảnh minh hoạ mở đầu', await ev(() => DRIntro.stage === 'illustrated' && DR.mode === 'dock' && DR.s.dock === 'dock.greater-marrow'));
  check('lúc mở đầu chưa chạy hội thoại', await ev(() => !DRDialogue.isOpen()));
  await sleep(4200);
  await shot('intro-1-scene1');
  await page.waitForFunction(() => DRIntro.time() > 9.6, null, { timeout: 15000 }).catch(() => {});
  await shot('intro-2-morgan');
  const textOn = await ev(() => { const t = document.querySelector('#dr-intro .in-text'); return t && t.classList.contains('on') ? t.textContent : null; });
  check('cảnh 2: tờ "Job Listing: Angler Wanted" hiện (Canvas/Text bật 7,4–11,6 s)', textOn === 'Job Listing: Angler Wanted', String(textOn));
  // giữ Space 2 giây để bỏ qua (IntroIllustratedCutscene: sau 2 s, giữ 2 s)
  await page.keyboard.down('Space'); await sleep(2400); await page.keyboard.up('Space');
  const stg = await ev(() => DRIntro.stage);
  check('giữ Space 2 s: bỏ cảnh minh hoạ, sang máy quay hải đăng', stg === 'cinematic', String(stg));
  await sleep(2500);
  await shot('intro-3-cinematic');
  const camPos = await ev(() => { const p = DRCamera.cam.position; return [p.x, p.y, p.z]; });
  check('máy quay mở đầu ở xa bến (gần hải đăng)', Math.hypot(camPos[0] + 3, camPos[2]) > 20, camPos.map(v => v.toFixed(1)).join(','));
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 8000 }).catch(() => {});
  check('mốc 5,5 s: hội thoại của bến bắt đầu', await ev(() => DRDialogue.isOpen()));
  check('chạy node gốc của bến rồi tới Mayor_Intro_0', await ev(() => __nodes.slice(0, 2).join('>')) === 'GreaterMarrow_Root>Mayor_Intro_0', await ev(() => __nodes.join('>')));

  // ---- Mayor_Intro_0
  let portraitShot = false;
  const intro0 = await talk(null, async s => {
    if (!portraitShot && s.name === 'Mayor' && s.kind === 'line' && !s.typing) { portraitShot = true; await shot('dialogue-portrait'); }
  });
  const first = intro0[0] || {};
  check('dòng đầu là lời kể "The morning light fills your eyes..."', /^The morning light fills your eyes/.test(first.text || ''), (first.text || '').slice(0, 50));
  const mayorLine = intro0.find(l => l.name === 'Mayor');
  check('Mayor nói có bảng tên + chân dung prefab Mayor', !!mayorLine && mayorLine.prefab === 'Mayor', mayorLine && (mayorLine.name + ' / ' + mayorLine.prefab));
  check('chụp được khung thoại có chân dung', portraitShot);
  const q0 = await ev(() => ({ st: DRQuests.state('Quest_Intro'), step: DR.s.quests.Quest_Intro && DR.s.quests.Quest_Intro.activeStepId, title: DRQuests.title('Quest_Intro'),
    funds: DR.s.funds, debt: DR.s.vars['gm-debt'], rep: DR.s.vars['gm-repayments'] || 0, marker: 'intro-fish' in DR.s.temporalMarkers, intro: !!DR.s.vars['played-intro-cinematic'] }));
  check('nhiệm vụ "A Fresh Start" (Quest_Intro) STARTED, bước Intro_Catch', q0.st === 'STARTED' && q0.step === 'Intro_Catch' && q0.title === 'A Fresh Start', JSON.stringify(q0));
  check('tiền $0.00, nợ tàu GreaterMarrowDebt = 50, đã trả 0', q0.funds === 0 && q0.debt === 50 && q0.rep === 0, '$' + q0.funds + ' nợ ' + q0.debt + ' trả ' + q0.rep);
  check('mốc thời gian intro-fish được đặt; cờ played-intro-cinematic', q0.marker && q0.intro);
  check('thông báo "Nhiệm vụ mới" cho Quest_Intro', await ev(() => __quest.some(e => e.kind === 'started' && e.id === 'Quest_Intro')));

  // ---- giao diện bến lúc đầu: chưa có điểm đến nào, Mayor chưa đứng ở bến
  await page.waitForFunction(() => DRDock._debug() && DRDock._debug().phase === 'ui', null, { timeout: 5000 }).catch(() => {});
  let dk = await ev(() => DRDock._debug());
  check('bến hiện giao diện sau hội thoại; chưa mở điểm đến nào (availableDestinations rỗng)', dk && dk.phase === 'ui' && dk.dests.length === 0, JSON.stringify(dk));
  check('nút Rời bến (BoatActions) có', await page.isVisible('.dk-boat .sub[data-act="undock"]'));
  await sleep(1500);
  await shot('dock-1-start');

  // ---- sổ nhiệm vụ
  await page.keyboard.press('KeyJ');
  await sleep(500);
  const jr = await ev(() => { const j = document.querySelector('.qj'); return j && { items: [...j.querySelectorAll('.qj-item')].map(b => b.textContent), steps: [...j.querySelectorAll('.qj-step')].map(s => s.textContent) }; });
  check('J mở sổ nhiệm vụ có "A Fresh Start" và bước bắt cá', !!jr && jr.items.includes('A Fresh Start') && jr.steps.some(t => /catch as many fish/.test(t)), JSON.stringify(jr));
  await shot('journal');
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Esc đóng sổ nhiệm vụ', !(await page.isVisible('.qj')));

  // ---- rời bến, câu một con cá
  await page.click('.dk-boat .sub[data-act="undock"]');
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 15000 }).catch(() => {});
  check('Rời bến → sail', await ev(() => DR.mode) === 'sail');
  const sp = await ev(() => DR_DEBUG.spotNear(['cod', 'mackerel'], -3, 0));
  await ev(s => { DR_DEBUG.setTime(0.4); DR_DEBUG.teleport(s.x + 3.2, s.z, 0); }, sp);
  await page.waitForFunction(() => DR.view.nearSpot, null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'harvest', null, { timeout: 5000 }).catch(() => {});
  await ev(() => DR_DEBUG.catchNow());
  // bản gốc ở lại màn câu sau mỗi con (HarvestMinigameView): Esc để rời; không thì dọn tay như test/dredge-fishing.js
  await sleep(1500);
  if (await ev(() => DR.mode === 'harvest')) await page.keyboard.press('Escape');
  await page.waitForFunction(() => DR.mode === 'sail', null, { timeout: 5000 }).catch(() => {});
  await ev(() => { if (DR.mode === 'sail') return; try { DRMinigame.hide(); } catch (e) { /* */ } if (DRCargo.isOpen()) DRCargo.close(); DRSpots.cur = null; DRSpots.fishing = false; if (DR.mode !== 'sail') DR.setMode('sail'); });
  if (await ev(() => !!document.querySelector('#dr-pause:not([hidden])'))) await page.click('#btn-resume');
  const fish = await ev(() => DR.grid('INVENTORY').items.filter(i => DR_ITEMS[i.id] && DRGrid.subOf(DR_ITEMS[i.id]) & DRGrid.SUB.FISH).map(i => ({ id: i.id, size: i.size, fresh: i.fresh })));
  check('câu được cá (DR_DEBUG.catchNow)', fish.length === 1, JSON.stringify(fish));

  // ---- về bến: Mayor_Intro_1_Fish
  await ev(() => {
    const d = DRDocks.byId['dock.greater-marrow'];
    for (let r = 3; r < 8; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) {
      const x = d.poi.x + Math.cos(a) * r, z = d.poi.z + Math.sin(a) * r;
      if (DRWorld.sdf(x, z) > 1.8) { DR_DEBUG.teleport(x, z, DR.s.boat.yaw); return; }
    }
  });
  await ev(() => DR_DEBUG.setTime(0.3));
  await page.waitForFunction(() => DR.view.nearDock, null, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press('Space');
  await page.waitForFunction(() => DR.mode === 'dock' && DRDialogue.isOpen(), null, { timeout: 25000 }).catch(() => {});
  let optShot = false;
  const intro1 = await talk(opts => opts.find(o => /Where do I sell/.test(o.text)) ? opts.find(o => /Where do I sell/.test(o.text)).index : 0, async s => {
    if (!optShot && s.kind === 'options') { await sleep(900); optShot = true; await shot('dialogue-options'); }
  });
  const opt = intro1.find(x => x.options);
  check('về bến có cá: Mayor_Intro_1_Fish với 2 lựa chọn', !!opt && opt.node === 'Mayor_Intro_1_Fish' && opt.options.length === 2,
    JSON.stringify(opt) + ' | ' + JSON.stringify(await ev(() => ({ mode: DR.mode, dock: DR.s.dock, ui: DRDock._debug(), nodes: __nodes.slice(-4), near: DR.view.nearDock }))));
  check('chọn "Where do I sell the fish?" → Mayor chỉ chỗ Người buôn cá', intro1.some(l => /Our local Fishmonger/.test(l.text || '')));
  const q1 = await ev(() => ({ step: DR.s.quests.Quest_Intro.activeStepId, done: DR.s.quests.Quest_Intro.completedStepIds.slice(), dests: DR.s.availableDestinations.slice(), introduced: !!DR.s.vars['gm-debt-introduced'] }));
  check('bước Intro_Catch xong → Intro_Sell', q1.step === 'Intro_Sell' && q1.done.includes('Intro_Catch'), JSON.stringify(q1));
  check('mở Người buôn cá + Kho (SetDestinationAvailable)', q1.dests.includes('destination.gm-fishmonger') && q1.dests.includes('destination.storage'), q1.dests.join(','));
  check('thông báo "Nhiệm vụ cập nhật"', await ev(() => __quest.some(e => e.kind === 'updated' && e.id === 'Quest_Intro' && e.step === 'Intro_Sell')));
  await page.waitForFunction(() => DRDock._debug() && DRDock._debug().phase === 'ui', null, { timeout: 5000 }).catch(() => {});
  dk = await ev(() => DRDock._debug()) || { dests: [], speakers: [] };
  check('bến hiện nút Người buôn cá và Kho của tôi', dk.dests.includes('destination.gm-fishmonger') && dk.dests.includes('destination.storage'), dk.dests.join(','));
  const debtTxt = await ev(() => { const p = document.querySelector('.dk-progress'); return p && p.textContent; });
  check('bảng nợ tàu: "Còn nợ $50.00" (gốc "{0} remaining")', !!debtTxt && /Còn nợ \$50\.00/.test(debtTxt), debtTxt);
  await sleep(1200);
  await shot('dock-2-destinations');

  // ---- Người buôn cá: hội thoại rồi chợ
  await page.click('.dk-dest[data-dest="destination.gm-fishmonger"]');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
  const fm = await talk();
  check('Người buôn cá nói lần đầu (Fishmonger_Intro)', fm.some(l => l.name === 'Fishmonger'), (fm.find(l => l.name) || {}).text);
  // r2shop: chợ là hai lưới (js/shop.js) thay bảng danh sách; bán = rê con cá trong khoang rồi bấm F (SellItem)
  await page.waitForFunction(() => window.DRShop && DRShop.isOpen(), null, { timeout: 5000 }).catch(() => {});
  await sleep(900);
  const sale = await ev(() => { const inv = DR.grid('INVENTORY'); const f = inv.items.find(i => DRGrid.subOf(DR_ITEMS[i.id]) & DRGrid.SUB.FISH); return { funds: DR.s.funds, price: DRRules.sellPrice(DR_CONFIG, DR_ITEMS[f.id], f, 1, 1) }; });
  await shot('market');
  const fc = await ev(() => { const f = DR.grid('INVENTORY').items.find(i => DRGrid.subOf(DR_ITEMS[i.id]) & DRGrid.SUB.FISH), g = document.querySelector('.cg-grid[data-key="INVENTORY"]').getBoundingClientRect(), cs = DRCargo._debug().cs;
    return { x: g.left + (f.cells[0][0] + 0.5) * cs, y: g.top + (f.cells[0][1] + 0.5) * cs }; });
  await page.mouse.move(fc.x, fc.y, { steps: 3 }); await sleep(250);
  await page.keyboard.press('KeyF');
  await sleep(400);
  const after = await ev(() => ({ funds: DR.s.funds, rep: DR.s.vars['gm-repayments'], tx: (DR.s.shopHistories['destination.gm-fishmonger'] || {}).transactionDays }));
  const wantRep = Math.round(sale.price * 0.15 * 100) / 100, wantFunds = Math.round((sale.price - wantRep) * 100) / 100;
  check('bán cá: tiền = giá − 15% trả nợ, nợ đã trả = 15% giá', Math.abs(after.funds - wantFunds) < 0.006 && Math.abs(after.rep - wantRep) < 0.006,
    'giá ' + sale.price + ' → tiền ' + after.funds + ' (mong ' + wantFunds + '), trả nợ ' + after.rep + ' (mong ' + wantRep + ')');
  check('ghi giao dịch của destination.gm-fishmonger (GetNumShopTransactionDaysUnique > 0)', Array.isArray(after.tx) && after.tx.length === 1, JSON.stringify(after.tx));

  // ---- quay lại thị trấn: Mayor_Intro_2 + lưới nhận Research Part
  await page.keyboard.press('Escape');                                       // r2shop: rời chợ = đóng khoang (Back)
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
  const intro2 = await talk();
  check('rời chợ → node gốc chạy Mayor_Intro_2', intro2.some(l => /Excellent work/.test(l.text || '')), (intro2[1] || {}).text);
  await page.waitForSelector('#dr-dlg .sg-panel [data-act="take"]', { timeout: 6000 }).catch(() => {});
  const gridOn = await page.isVisible('#dr-dlg .sg-panel [data-act="take"]');
  check('ShowQuestGrid IntroReward: bảng nhận đồ hiện', gridOn);
  if (gridOn) { await shot('quest-grid'); await page.click('#dr-dlg .sg-panel [data-act="take"]'); }
  await talk();
  const q2 = await ev(() => ({ step: DR.s.quests.Quest_Intro.activeStepId, done: DR.s.quests.Quest_Intro.completedStepIds.slice(), dests: DR.s.availableDestinations.slice(),
    part: DR.grid('INVENTORY').items.some(i => i.id === 'research-item') }));
  check('bước Intro_Sell xong → Intro_Shipwright', q2.step === 'Intro_Shipwright' && q2.done.includes('Intro_Sell'), JSON.stringify(q2));
  check('nhận Research Part vào khoang', q2.part);
  check('mở Thợ đóng tàu, Nghỉ, Nghiên cứu', ['destination.gm-shipwright', 'destination.rest', 'destination.research'].every(d => q2.dests.includes(d)), q2.dests.join(','));

  // ---- Thợ đóng tàu: Shipwright_Visit_0 → xong nhiệm vụ
  await page.waitForFunction(() => DRDock._debug() && DRDock._debug().phase === 'ui', null, { timeout: 5000 }).catch(() => {});
  await sleep(800);
  await shot('dock-3-after-sell');
  await page.click('.dk-dest[data-dest="destination.gm-shipwright"]');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
  await talk();
  const q3 = await ev(() => ({ st: DRQuests.state('Quest_Intro'), speakers: DR.s.availableSpeakers.slice() }));
  check('gặp Thợ đóng tàu → "A Fresh Start" COMPLETED', q3.st === 'COMPLETED', JSON.stringify(q3));
  check('Mayor đứng ở bến từ nay (SetSpeakerAvailability Mayor true)', q3.speakers.includes('Mayor'), q3.speakers.join(','));
  check('thông báo "Hoàn thành nhiệm vụ"', await ev(() => __quest.some(e => e.kind === 'completed' && e.id === 'Quest_Intro')));
  await page.waitForFunction(() => window.DRShop && DRShop.isOpen(), null, { timeout: 4000 }).catch(() => {});
  await page.keyboard.press('Escape');                                       // r2shop: xưởng tàu mở lưới hàng; Esc rời điểm đến
  await sleep(600);
  await talk();
  await page.waitForFunction(() => DRDock._debug() && DRDock._debug().phase === 'ui', null, { timeout: 5000 }).catch(() => {});
  await sleep(1300);
  dk = await ev(() => DRDock._debug());
  check('nút nhân vật Mayor ở góc dưới trái', dk.speakers.includes('Mayor'), dk.speakers.join(','));
  await shot('dock-4-speakers');
  // nói với Mayor (Mayor_Root → lựa chọn) rồi thoát nhanh bằng lựa chọn #exit
  await page.click('.dk-speaker[data-speaker="Mayor"]');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
  const mr = await talk(opts => { const ex = opts.find(o => (o.meta || []).includes('exit')); return ex ? ex.index : opts[opts.length - 1].index; });
  check('nói với Mayor: Mayor_Root có lựa chọn, thoát bằng lựa chọn #exit', mr.some(x => x.options), JSON.stringify(mr.find(x => x.options) || null).slice(0, 160));

  // ---- lưu
  const saved = await ev(() => { DR.save(); const v = JSON.parse(localStorage.getItem('dredge.save.v1')); return { q: v.quests && v.quests.Quest_Intro && v.quests.Quest_Intro.state, vn: (v.visitedNodes || []).length, ad: (v.availableDestinations || []).length }; });
  check('sổ lưu có quests / visitedNodes / availableDestinations', saved.q === 'COMPLETED' && saved.vn > 5 && saved.ad >= 5, JSON.stringify(saved));

  // ---- hiệu năng (lái thuyền gần Greater Marrow, như dredge-suite)
  await ev(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 15000 }).catch(() => {});
  await ev(() => DR_DEBUG.teleport(20, -30, 0.3));
  await page.keyboard.down('KeyW'); await sleep(3000);
  const p = await ev(() => DR_DEBUG.perf());
  await page.keyboard.up('KeyW');
  out.push('  · hiệu năng: khung ' + p.avgMs.toFixed(1) + ' ms (max ' + p.maxMs.toFixed(1) + '), CPU/khung ' + p.cpuMs.toFixed(2) + ' ms, ' + p.calls + ' draw call (trước ván: ' + perf0.calls + ')');
  out.push('  · lệnh Yarn chưa có hệ thống gặp trong lượt chơi: ' + (infos.length ? [...new Set(infos)].join(' | ') : 'không'));
  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 6).join(' | '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try { await run(browser, base); } catch (e) { fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e)); }
  await browser.close();
  if (srv) srv.close();
  console.log('DREDGE story — ' + base);
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
