/*
 * VOID DIVER — luồng game + sảnh Balusha: chơi thật trên trang (Playwright, Chromium headless, WebGL swiftshader).
 *
 * Chạy:  node test/voiddiver-lounge.js [--only=flow|mobile] [--keep]
 *   1. 1280×720: tiêu đề → Game mới → prologue gốc (Campaign/1100 OnLounge, giữ Esc bỏ qua cả đoạn) → ForceStartStage → lượt lặn 1100
 *      → dịch chuyển vào va chạm 100097 (CallCollision_7: cutscene boss, SetStep(10), ForceEscapeStage gốc) → kết quả → sảnh
 *      → OnLounge step 10 → QuestComplete (giữ Esc bỏ qua; Coin +10, SetIsTutorial(false)) → LoungeQuest 80200 (nói với Elara, Narcis, Felix, Lucas,
 *      về Elara) → 81101 → Elara: bảng Campaign chọn 1101 → giao việc → bốt điện thoại → lượt lặn 1101 → (đánh dấu nhiệm vụ đạt +
 *      ForceEscapeStage của dive.js) → sảnh → QuestComplete 1101 → Chủ nhân lên cấp → Lucas mua đồ → 82100 → máy Antikythera chế tạo
 *      → Felix kích hoạt talent → tải lại trang → Tiếp tục → trạng thái còn nguyên.
 *   2. 844×390: tiêu đề, sảnh, menu NPC, bảng Campaign/Talent/Kho đọc được, không tràn.
 *   3. (--only=lobbyplay) HUD người chơi ở sảnh; Felix → SkillSelectPopup bằng chuột thật (ô khoá, tháo skill trùng, lưu khi đóng);
 *      RMB/Q thật ở sảnh (không tốn thể lực/căng thẳng); phòng tập 9003: bù nhìn nhận sát thương; đổi trang bị áp ngay, ô C.
 *   4. (--only=lobbybag) Tab thật ở sảnh mở trang Túi đồ + cột Kho; bấm ô kho sang túi; Tab/Esc đóng, hồ sơ ghi lại đủ món.
 *   Hỏng nếu: pageerror, console error, response ≥ 400. Ảnh ở %TEMP%/voiddiver-lounge-shots/ — mở ra xem.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'voiddiver-lounge-shots');
const OPT = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v == null ? true : v]; }));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.css': 'text/css', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.skel': 'application/octet-stream', '.atlas': 'text/plain', '.woff2': 'font/woff2' };

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name + (detail != null ? '  (' + detail + ')' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail != null ? '  (' + detail + ')' : '')); }
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, ms, label) {
  try { await page.waitForFunction(fn, arg, { timeout: ms || 30000, polling: 150 }); return true; }
  catch (e) { console.log('    (hết giờ chờ: ' + (label || fn.toString().slice(0, 90)) + ')'); return false; }
}
async function newPage(browser, w, h, errors) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return page;
}
const shots = [];
async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  shots.push(f);
  console.log('    ảnh: ' + f);
}
const dialogIdle = (page, ms) => waitFor(page, () => !(VD.dialog && VD.dialog.open) && !(VD.lounge.luaQueue.length), null, ms || 120000, 'hộp thoại đóng');
const trace = page => page.evaluate(() => VD.lounge.trace.slice());
const prof = page => page.evaluate(() => JSON.parse(JSON.stringify(VD.profile.get())));
async function ctrl(page) { await page.keyboard.up('Control'); await page.keyboard.down('Control'); }

// Đi tới NPC (dịch chuyển cạnh NPC rồi đi bộ một nhịp), bấm F thật, đợi menu.
async function talkTo(page, npcId) {
  await page.evaluate(id => VD.lounge.debug.toNpc(id), npcId);
  await page.keyboard.down('KeyS'); await sleep(250); await page.keyboard.up('KeyS');
  await page.evaluate(id => VD.lounge.debug.toNpc(id), npcId);
  await sleep(300);
  const near = await page.evaluate(() => VD.lounge.focus && VD.lounge.focus.id);
  await page.keyboard.up('Control');
  await page.keyboard.press('KeyF');
  const ok = await waitFor(page, () => VD.npc.isOpen(), null, 8000, 'menu NPC ' + npcId);
  return ok && near === npcId;
}
// Bấm mục trong menu NPC theo chữ (hoặc lớp).
async function pick(page, sel) {
  const ok = await page.evaluate(sel => {
    const bs = [...document.querySelectorAll('.vd-npcmenu-choices button:not([disabled])')];
    const b = bs.find(x => x.classList.contains(sel)) || bs.find(x => x.textContent.indexOf(sel) >= 0);
    if (!b) return false; b.click(); return true;
  }, sel);
  return ok;
}
// Chạy hết một hội thoại Lua: giữ Ctrl (tua nhanh), gặp lựa chọn thì chọn mục đầu (Chấp nhận).
async function runDialog(page, ms) {
  await page.keyboard.down('Control'); await ctrl(page);
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 120000)) {
    const st = await page.evaluate(() => ({ open: !!(VD.dialog && VD.dialog.open), q: VD.lounge.luaQueue.length, ch: document.querySelectorAll('.vd-dlg-choices .vd-choice').length }));
    if (st.ch) { await page.evaluate(() => document.querySelector('.vd-dlg-choices .vd-choice').click()); await sleep(200); continue; }
    if (!st.open && !st.q) { await sleep(400); const again = await page.evaluate(() => !!(VD.dialog && VD.dialog.open)); if (!again) break; }
    await sleep(200);
  }
  await page.keyboard.up('Control');
}
// Đọc bảng nhiệm vụ sảnh: chữ, số dòng việc, dòng "việc kế tiếp", cỡ chữ, đè lên HUD khác, dải dẫn đường.
const tracker = page => page.evaluate(() => {
  const q = document.querySelector('.vd-lhud-quest'), r = q.getBoundingClientRect(), fs = sel => { const e = q.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
  const overlap = ['.vd-lhud-level', '.vd-lhud-wallet', '.vd-lhud-menu'].filter(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return !(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom); });
  const nx = q.querySelector('.slot.next .task');
  return { text: q.innerText, tasks: q.querySelectorAll('.slot:not(.next) .task').length, diff: !!q.querySelector('.diff'), next: nx ? nx.textContent : null,
    target: VD.lounge.nextStep().npc, nameFs: fs('.name'), taskFs: fs('.task'), overlap, ribbon: !!(VD.groundNav && VD.groundNav.mesh && VD.groundNav.mesh.visible),
    tx: { q80200: VD.TEXT.TLoungeQuest_Name_80200, q81101: VD.TEXT.TLoungeQuest_Name_81101, elara: VD.TEXT.LCommon_4001, booth: VD.TEXT.LCommon_4011 } };
});
const menuItems = page => page.evaluate(() => [...document.querySelectorAll('.vd-npcmenu-choices button')].map(b => b.className + ':' + b.textContent.trim()));

// ================================================================ 1. Luồng chính 1280×720
async function flow(browser, port, errors) {
  console.log('\n== Luồng game 1280×720');
  const page = await newPage(browser, 1280, 720, errors);
  await page.goto(`${process.env.VD_BASE || ("http://127.0.0.1:" + port)}/games/voiddiver/index.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  check('màn tiêu đề', await waitFor(page, () => document.body.dataset.ready === 'title', null, 60000));
  const btns = await page.evaluate(() => [...document.querySelectorAll('.vd-title-menu button')].map(b => b.dataset.a));
  check('hồ sơ trống: chỉ "Game mới" + âm thanh', btns.join(',') === 'new,sound', btns.join(','));
  await shot(page, '01-title');

  // ---- Game mới → prologue
  await page.click('.vd-title-menu [data-a=new]');
  check('vào sảnh (Game mới)', await waitFor(page, () => VD.app.scene === 'lounge' && document.body.dataset.lounge === 'play', null, 240000));
  check('campaign đang nhận = 1100', (await prof(page)).activeCampaign.id === 1100);
  check('prologue: Campaign/1100.OnLounge chạy', await waitFor(page, () => VD.lounge.trace.indexOf('Campaign/1100.OnLounge') >= 0, null, 20000));
  await waitFor(page, () => document.querySelector('.vd-note'), null, 20000, 'thư prologue');
  await shot(page, '02-prologue-letter');
  // Bỏ qua cả prologue: giữ Esc 1 s (khung "Giữ để bỏ qua" dựng theo CutscenePanel gốc). Lua gốc vẫn chạy từng dòng
  // nên SetString(110001,"prologue") và ForceStartStage vẫn xảy ra.
  const skipUi = await page.evaluate(() => { const e = document.querySelector('.vd-dialog.on .vd-dlg-skip'); return e ? e.textContent.trim() : null; });
  check('khung "Giữ để bỏ qua" hiện trên thư prologue', skipUi === await page.evaluate(() => VD.TEXT.CutSceneSkip), skipUi);
  await page.keyboard.down('Escape'); await sleep(500);
  await shot(page, '03-prologue-skip-hold');
  await sleep(900); await page.keyboard.up('Escape');
  check('giữ Esc: prologue tua hết, thư đóng', await waitFor(page, () => !document.querySelector('.vd-note'), null, 20000, 'thư đóng'));
  await page.keyboard.down('Control');
  // ForceStartStage gốc → lặn 1100
  const dived = await waitFor(page, () => VD.app.scene === 'dive' && (VD.dive.state === 'intro' || VD.dive.state === 'play'), null, 300000, 'lặn 1100');
  check('prologue kết thúc bằng ForceStartStage → lượt lặn 1100', dived);
  check('prologue đánh dấu GetString(110001,"prologue")', (await prof(page)).quest['110001'] && (await prof(page)).quest['110001'].s.prologue === 'true');
  await page.evaluate(() => VD.dive.debug.skipIntro());
  await waitFor(page, () => VD.dive.state === 'play', null, 60000, 'play');
  await page.keyboard.up('Control');
  await shot(page, '04-dive-1100');

  // ---- đi thẳng tới va chạm cuối 100097 (cutscene, SetStep(10), ForceEscapeStage của Lua gốc)
  await page.keyboard.down('Control');
  await ctrl(page);
  await page.evaluate(() => { const e = VD.dive.ents.find(e => e.kind === 'collision' && e.triggerId === 100097); if (e) VD.dive.debug.teleport(e.pos.x, e.pos.z); });
  let esc = await waitFor(page, () => VD.dive.state === 'escaping' || VD.dive.state === 'result' || VD.app.scene === 'lounge', null, 120000, 'thoát 1100');
  if (!esc) {   // dự phòng: gọi đúng hai hàm LuaApi mà CallCollision_7 gọi
    console.log('    (dự phòng: SetStep(10) + ForceEscapeStage)');
    await page.evaluate(() => { VD.lua.api.SetStep(10); VD.lua.api.ForceEscapeStage(); });
    esc = await waitFor(page, () => VD.dive.state === 'escaping' || VD.dive.state === 'result', null, 60000);
  }
  check('1100 kết thúc bằng ép thoát', esc);
  await waitFor(page, () => document.querySelector('.vd-result'), null, 60000, 'màn kết quả');
  await shot(page, '05-dive-result');
  await page.evaluate(() => VD.dive.debug.dismissResult());
  check('về sảnh sau lượt lặn', await waitFor(page, () => VD.app.scene === 'lounge' && document.body.dataset.lounge === 'play', null, 240000));
  check('dive.js ghi qua 1100', (await prof(page)).clears['1100'] >= 1);
  // ---- QuestComplete (OnLounge step 10): đọc một dòng rồi giữ Esc bỏ qua cả đoạn; GiveCoin/SetIsTutorial/SetQuestState vẫn chạy.
  await page.keyboard.up('Control');
  await waitFor(page, () => VD.dialog && VD.dialog.open && VD.dialog.text && VD.dialog.text.textContent.length > 0, null, 120000, 'QuestComplete mở');
  await shot(page, '05b-questcomplete');
  await page.keyboard.down('Escape'); await sleep(1400); await page.keyboard.up('Escape');
  check('QuestComplete: Coin +10', await waitFor(page, () => VD.profile.get().wallet.coin >= 10, null, 120000, 'coin 10'));
  let p = await prof(page);
  check('QuestComplete: SetIsTutorial(false)', p.isTutorial === false);
  check('campaign 1100 hoàn tất, bỏ nhận', p.activeCampaign === null, JSON.stringify(p.activeCampaign));
  await dialogIdle(page);
  await page.keyboard.up('Control');
  await sleep(600);
  p = await prof(page);
  check('LoungeQuest 80200 mở (CampaignCleared:1100) → InProgress', p.loungeQuest['80200'] === 2, p.loungeQuest['80200']);
  check('Elara có hội thoại Quest InProgressDialog', p.dialogs.some(d => d.npc === 700000 && d.FunctionName === 'InProgressDialog'));
  await shot(page, '06-lounge-after-tutorial');
  // Bảng nhiệm vụ sảnh (hud.js renderQuest): 80200 + việc của nó, dòng "việc kế tiếp" chỉ Elara (LCommon_4001), cỡ chữ theo khung 1080p.
  let trk = await tracker(page);
  check('bảng nhiệm vụ sau tutorial: 80200 + 3 việc + "việc kế tiếp" Elara', trk.text.indexOf(trk.tx.q80200) >= 0 && trk.tasks >= 3 && trk.next === trk.tx.elara && trk.target === 700000, JSON.stringify(trk));
  check('bảng nhiệm vụ đủ lớn ở 1280×720 (tên ≥ 17 px, việc ≥ 14 px)', trk.nameFs >= 17 && trk.taskFs >= 14, trk.nameFs + '/' + trk.taskFs);

  // ---- 80200: Elara → Narcis/Felix/Lucas → Elara
  check('F ở Elara mở menu', await talkTo(page, 700000));
  const it = await menuItems(page);
  check('menu Elara: mục Quest "!" + Chiến dịch + Trò chuyện', it.some(s => /quest/.test(s)) && it.some(s => /Chiến dịch/.test(s)) && it.some(s => /talkmenu/.test(s)), it.join(' | '));
  await shot(page, '07-elara-menu');
  await pick(page, 'quest');
  await runDialog(page);
  p = await prof(page);
  check('InProgressDialog đăng ký hội thoại ở Narcis/Felix/Lucas', [700013, 700008, 700001].every(n => p.dialogs.some(d => d.npc === n && d.LuaKey === 'LoungeQuest/80200')));
  for (const n of [700013, 700008, 700001]) {
    await page.keyboard.up('Control');
    const ok = await talkTo(page, n);
    await pick(page, 'quest');
    await runDialog(page);
    check('nói chuyện nhiệm vụ với ' + n, ok);
  }
  await page.keyboard.up('Control');
  p = await prof(page);
  check('80200 → NotCompleted (3 việc LuaProgress đạt)', p.loungeQuest['80200'] === 3, p.loungeQuest['80200']);
  await talkTo(page, 700000);
  await pick(page, 'quest');
  await runDialog(page);
  await page.keyboard.up('Control');
  await sleep(800);
  p = await prof(page);
  check('80200 Completed', p.loungeQuest['80200'] === 4);
  check('81101 "Lần lặn đầu tiên" InProgress', p.loungeQuest['81101'] === 2, p.loungeQuest['81101']);
  await page.evaluate(() => VD.lounge.debug.teleport(VD.lounge.start.x, VD.lounge.start.z));   // xa Elara để dải dẫn đường hiện
  await sleep(600);
  trk = await tracker(page);
  check('sau 80200: bảng không trống (81101 ẩn làm mục tiêu) + "việc kế tiếp" Elara + dải dẫn đường', trk.text.indexOf(trk.tx.q81101) >= 0 && trk.next === trk.tx.elara && trk.ribbon, JSON.stringify(trk));

  // ---- Campaign 1101
  await talkTo(page, 700000);
  await pick(page, 'Chiến dịch');
  check('bảng Campaign mở', await waitFor(page, () => document.body.dataset.panel === 'campaign', null, 5000));
  await page.evaluate(() => { const r = document.querySelector('.vd-camp .vd-row[data-id="1101"]'); if (r) r.click(); });
  await sleep(300);
  await shot(page, '08-campaign-panel');
  const campInfo = await page.evaluate(() => ({ sel: document.querySelector('.vd-camp .vd-row.sel') && document.querySelector('.vd-camp .vd-row.sel').dataset.id,
    btn: !document.querySelector('[data-act=accept]').disabled, rw: document.querySelectorAll('.vd-camp .rw .vd-gcell').length, diff: document.querySelectorAll('.vd-camp .diff button').length }));
  check('1101 chọn được, có thưởng + 4 độ khó', campInfo.sel === '1101' && campInfo.btn && campInfo.rw > 0 && campInfo.diff === 4, JSON.stringify(campInfo));
  await page.click('[data-act=accept]');
  await sleep(500);
  p = await prof(page);
  check('nhận campaign 1101', p.activeCampaign && p.activeCampaign.id === 1101);
  check('OnLoungeCommon → SetStep(1) → Step_00001: giao việc ở Elara', await waitFor(page, () => VD.profile.get().dialogs.some(d => d.npc === 700000 && d.FunctionName === 'TalkToNPC'), null, 20000));
  await talkTo(page, 700000);
  await pick(page, 'quest');
  await runDialog(page);
  await page.keyboard.up('Control');
  await waitFor(page, () => VD.profile.quest('c1101').step === 2, null, 15000, 'SetStep(2) sau PingToNpc');
  p = await prof(page);
  check('giao việc xong → step 2, quest InProgress', p.quest['c1101'].step === 2 && p.quest['c1101'].state === 2, JSON.stringify({ s: p.quest['c1101'].step, st: p.quest['c1101'].state }));
  // bốt điện thoại
  await page.evaluate(() => VD.lounge.debug.toBooth());
  await sleep(300);
  check('lời nhắc F ở bốt điện thoại', await page.evaluate(() => VD.lounge.focus === 'booth'));
  await shot(page, '09-booth');
  trk = await tracker(page);
  check('đã nhận 1101: slot campaign (độ khó + việc) + "việc kế tiếp" bốt lặn', trk.diff && trk.tasks >= 2 && trk.next === trk.tx.booth && trk.target === 'booth', JSON.stringify(trk));
  await page.keyboard.press('KeyF');
  check('bốt → VD.app.toDive → lặn 1101', await waitFor(page, () => VD.app.scene === 'dive' && VD.dive.camp && VD.dive.camp.Id === 1101 && (VD.dive.state === 'intro' || VD.dive.state === 'play'), null, 300000, 'lặn 1101'));
  await page.evaluate(() => VD.dive.debug.skipIntro());
  await waitFor(page, () => VD.dive.state === 'play', null, 60000);
  await sleep(1500);
  await shot(page, '10-dive-1101');
  // Kết quả giả của lượt 1101: nhiệm vụ đạt + ép thoát bằng LuaApi của dive.js (luật kết quả vẫn là buildResult thật).
  await page.evaluate(() => { for (const t of VD.dive.tasks) { t.done = true; t.cur = t.goal; } VD.inventory.add({ type: 'Item', id: 7000, count: 6 }); VD.lua.api.ForceEscapeStage(); });
  check('1101 thoát', await waitFor(page, () => document.querySelector('.vd-result'), null, 90000, 'kết quả 1101'));
  await page.evaluate(() => VD.dive.debug.dismissResult());
  check('về sảnh sau 1101', await waitFor(page, () => VD.app.scene === 'lounge' && document.body.dataset.lounge === 'play', null, 240000));
  p = await prof(page);
  check('1101 qua (tasks đạt)', p.clears['1101'] >= 1);
  check('OnLoungeCommon: IsAllTaskAchieved → step 10 → QuestComplete ở Elara', await waitFor(page, () => VD.profile.get().dialogs.some(d => d.npc === 700000 && d.FunctionName === 'QuestComplete'), null, 30000));
  const beforeExp = p.userExp;
  await talkTo(page, 700000);
  await pick(page, 'quest');
  await runDialog(page);
  await page.keyboard.up('Control');
  await sleep(1000);
  p = await prof(page);
  check('QuestComplete 1101: thưởng + EXP Campaign.GainedExp', p.userExp >= beforeExp + 1000 && p.activeCampaign === null, p.userExp - beforeExp);
  check('81101 Completed (CampaignClear:1101)', p.loungeQuest['81101'] === 4, p.loungeQuest['81101']);
  check('Chủ nhân 700005 xuất hiện (CampaignCleared:1101)', await page.evaluate(() => VD.lounge.npcs.has(700005)));
  await shot(page, '11-lounge-after-1101');

  // ---- 80100 "Khai trương hoành tráng": Chủ nhân đưa Tràng hạt Đau khổ (108021) → khách 600012 → đàm phán cổ vật → về báo
  p = await prof(page);
  check('80100 mở (CampaignCleared:1101), Chủ nhân có hội thoại', p.loungeQuest['80100'] === 1 && p.dialogs.some(d => d.npc === 700005 && d.LuaKey === 'LoungeQuest/80100'));
  await talkTo(page, 700005);
  await pick(page, 'quest');
  await runDialog(page);
  p = await prof(page);
  check('nhận Tràng hạt Đau khổ 108021 (GiveEquipment)', p.stash.some(g => g.type === 'Equipment' && g.id === 108021));
  check('khách 600012 xuất hiện (SpawnNpc)', await waitFor(page, () => VD.lounge.npcs.has(600012), null, 10000));
  await sleep(800);
  await shot(page, '12a-guest');
  const coin0 = (await prof(page)).wallet.coin;
  await talkTo(page, 600012);
  await pick(page, 'Đàm phán');
  check('bảng đàm phán cổ vật', await waitFor(page, () => document.body.dataset.panel === 'deal', null, 5000));
  await page.evaluate(() => { const c = document.querySelector('.p-deal .arts .vd-gcell'); if (c) c.click(); });
  await sleep(200);
  await page.evaluate(() => { const c = document.querySelector('.p-deal .card:not([disabled])'); if (c) c.click(); });
  await sleep(200);
  await shot(page, '12b-deal');
  await page.evaluate(() => document.querySelector('.p-deal .sealb').click());
  await sleep(1500);
  p = await prof(page);
  check('chốt giao dịch: cổ vật đi, nhận Coin', !p.stash.some(g => g.id === 108021) && p.wallet.coin > coin0, coin0 + '→' + p.wallet.coin);
  await talkTo(page, 700005);
  await pick(page, 'quest');
  await runDialog(page);
  await sleep(1000);
  p = await prof(page);
  check('80100 về báo Chủ nhân (State Return)', p.quest['80100'] && p.quest['80100'].s.State === 'Return', p.quest['80100'] && p.quest['80100'].s.State);

  // ---- lên cấp ở Chủ nhân
  const lv0 = p.userLevel, coinLv = p.wallet.coin;
  check('đủ EXP lên cấp 2', await page.evaluate(() => VD.profile.canLevelUp()), p.userExp);
  await talkTo(page, 700005);
  const itO = await menuItems(page);
  await pick(page, 'Cấp Độ Danh Tiếng');
  await waitFor(page, () => document.querySelector('.vd-lvup'), null, 5000, 'thoại lên cấp');
  await shot(page, '12-levelup');
  await page.evaluate(() => document.querySelector('.vd-lvup .vd-npcmenu-choices button[data-i="0"]').click());
  await waitFor(page, () => document.querySelector('.vd-lvup .vd-npcmenu-choices button'), null, 5000);
  await page.evaluate(() => { const b = document.querySelector('.vd-lvup .vd-npcmenu-choices button'); if (b) b.click(); });
  p = await prof(page);
  check('lên cấp 2 (trả 3 Coin)', p.userLevel === lv0 + 1 && p.wallet.coin === coinLv - 3, 'Lv' + p.userLevel + ' coin ' + p.wallet.coin + ' | menu ' + itO.join('/'));
  await sleep(1200);
  p = await prof(page);
  check('80002 mở theo UserLevel:2', (p.loungeQuest['80002'] | 0) >= 1, p.loungeQuest['80002']);

  // ---- mua đồ ở Lucas
  await dialogIdle(page);
  await talkTo(page, 700001);
  await pick(page, 'Cửa Hàng');
  await waitFor(page, () => document.body.dataset.panel === 'shop', null, 5000);
  const gold0 = (await prof(page)).wallet.gold;
  const bought = await page.evaluate(() => { const b = document.querySelector('.p-shop .vd-row[data-product] .buy:not([disabled])'); if (!b) return null; const id = b.closest('.vd-row').dataset.product; b.click(); return id; });
  await sleep(200);
  await shot(page, '13-shop');
  p = await prof(page);
  check('mua ở Lucas: trừ Gold, đồ vào kho', bought && p.wallet.gold < gold0, 'sp ' + bought + ' gold ' + gold0 + '→' + p.wallet.gold);
  await page.keyboard.press('Escape');

  // ---- 82100 → máy Antikythera → chế tạo
  p = await prof(page);
  const scrap = p.stash.filter(g => g.type === 'Item' && g.id === 7000).reduce((a, g) => a + g.count, 0);
  check('82100 "Bánh răng đang ngủ" đang chạy', (p.loungeQuest['82100'] | 0) >= 1, p.loungeQuest['82100'] + ' scrap ' + scrap);
  if (scrap < 10) await page.evaluate(n => VD.profile.give({ type: 'Item', id: 7000, count: n }), 10 - scrap);   // phần thiếu so với thưởng thật
  // LoungeQuest/82100.lua: nhận ở Lucas (StartDialog, chọn "Chấp nhận") → có đủ 10 Đống Phế Liệu → NotCompleted → OnNotCompletedDialog ở Lucas.
  for (let i = 0; i < 3; i++) {
    p = await prof(page);
    if (p.loungeQuest['82100'] === 4) break;
    const d = p.dialogs.find(d => d.LuaKey === 'LoungeQuest/82100');
    if (!d) { await sleep(800); continue; }
    await talkTo(page, d.npc); await pick(page, 'quest'); await runDialog(page);
    await sleep(800);
  }
  await sleep(800);
  p = await prof(page);
  check('82100 Completed → máy Antikythera 700002 mở', p.loungeQuest['82100'] === 4 && await page.evaluate(() => VD.lounge.npcs.has(700002)), p.loungeQuest['82100']);
  // nguyên liệu cho một công thức không khoá
  const recipe = await page.evaluate(() => { const r = VD.T.Crafting.find(r => r.GroupId === 1 && VD.profile.condsOk(r.UnlockConditions)); return r ? { id: r.Id, mats: r.MaterialGoodsDatas, res: r.ResultGoodsData } : null; });
  if (recipe) await page.evaluate(m => { for (const x of m) { const g = VD.profile.parse(x); if (VD.profile.count(g.type, g.id) < g.count) VD.profile.give(Object.assign({}, g, { count: g.count - VD.profile.count(g.type, g.id) })); } }, recipe.mats);
  await talkTo(page, 700002);
  await pick(page, 'Chế tạo');
  await waitFor(page, () => document.body.dataset.panel === 'craft', null, 5000);
  const resG = recipe ? recipe.res.split(':') : ['Item', 0];
  const before = await page.evaluate(g => VD.profile.count(g[0], +g[1]), resG);
  await page.evaluate(id => { const r = document.querySelector(`.p-craft .vd-row[data-recipe="${id}"]`); if (r) r.click(); }, recipe && recipe.id);
  await sleep(150);
  await page.evaluate(() => document.querySelector('.p-craft .side .go').click());
  await sleep(200);
  await shot(page, '14-craft');
  const after = await page.evaluate(g => VD.profile.count(g[0], +g[1]), resG);
  check('chế tạo: công thức ' + (recipe && recipe.id) + ' ra đồ', after > before, before + '→' + after);
  await page.keyboard.press('Escape');

  // ---- talent ở Felix
  await page.evaluate(() => { if (VD.profile.gold() < 1000) VD.profile.giveGold(1000); if (VD.profile.count('Item', 7000) < 3) VD.profile.give({ type: 'Item', id: 7000, count: 3 }); });
  await talkTo(page, 700008);
  await pick(page, 'Đặc tính');
  await waitFor(page, () => document.body.dataset.panel === 'talent', null, 5000);
  await page.evaluate(() => { const n = document.querySelector('.tnode[data-id="1001"]'); if (n) n.click(); });
  await sleep(150);
  await shot(page, '15-talent');
  await page.evaluate(() => document.querySelector('.vd-talent .act').click());
  await sleep(200);
  p = await prof(page);
  check('kích hoạt talent 1001 (Gold 1000 + Item 7000×3)', !!p.talents['1001']);
  await shot(page, '16-talent-after');
  await page.keyboard.press('Escape');

  // ---- kho: chuyển đồ vào túi mang theo
  await talkTo(page, 700006);
  await pick(page, 'Kho chứa');
  await waitFor(page, () => document.body.dataset.panel === 'stash', null, 5000);
  const pk0 = (await prof(page)).pack.length;
  await page.evaluate(() => { const c = document.querySelector('.p-stash .stash .vd-gcell:not(.empty)'); if (c) c.click(); });
  await sleep(150);
  await shot(page, '17-stash');
  check('kho → túi mang theo', (await prof(page)).pack.length >= pk0 && (await prof(page)).pack.length > 0);
  await page.keyboard.press('Escape');

  // ---- tải lại trang → Tiếp tục
  const snap = await prof(page);
  await page.reload();
  check('tải lại: màn tiêu đề có "Tiếp tục"', await waitFor(page, () => document.querySelector('.vd-title-menu [data-a=continue]'), null, 60000));
  await page.click('.vd-title-menu [data-a=continue]');
  check('Tiếp tục vào sảnh', await waitFor(page, () => VD.app.scene === 'lounge' && document.body.dataset.lounge === 'play', null, 240000));
  const q = await prof(page);
  check('trạng thái còn nguyên (cấp, coin, gold, talent, quest, kho)', q.userLevel === snap.userLevel && q.wallet.coin === snap.wallet.coin && q.wallet.gold === snap.wallet.gold &&
    !!q.talents['1001'] && q.loungeQuest['80200'] === 4 && q.stash.length === snap.stash.length && q.clears['1101'] === snap.clears['1101']);
  await sleep(1500);
  await shot(page, '18-reload-continue');
  const tr = await trace(page);
  check('Lua không lỗi', (await page.evaluate(() => VD.lua.errors.length)) === 0, (await page.evaluate(() => VD.lua.errors.slice(0, 3).join(' | '))));
  console.log('    trace cuối: ' + tr.slice(-6).join(', '));
  return page;
}

// ================================================================ 2. Màn nhỏ 844×390
async function mobile(browser, port, errors) {
  console.log('\n== 844×390');
  const page = await newPage(browser, 844, 390, errors);
  await page.goto(`${process.env.VD_BASE || ("http://127.0.0.1:" + port)}/games/voiddiver/index.html`);
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await waitFor(page, () => document.body.dataset.ready === 'title', null, 60000);
  await shot(page, 'm01-title');
  const titleFit = await page.evaluate(() => { const r = document.querySelector('.vd-title-menu').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
  check('menu tiêu đề vừa màn', titleFit);
  // hồ sơ có tiến trình để thấy nhiều NPC/quest
  await page.evaluate(() => { const P = VD.profile; P.reset(); const p = P.get(); p.clears = { 1100: 1, 1101: 1 }; p.isTutorial = false; p.userLevel = 2; p.userExp = 3000; p.wallet.coin = 40; P.give({ type: 'Item', id: 7000, count: 12 }); P.save(); });
  await page.goto(`${process.env.VD_BASE || ("http://127.0.0.1:" + port)}/games/voiddiver/index.html?lounge=1`);
  check('sảnh ?lounge=1', await waitFor(page, () => document.body.dataset.lounge === 'play', null, 240000));
  await sleep(1500);
  await shot(page, 'm02-lounge');
  const mt = await tracker(page);
  check('844×390: bảng nhiệm vụ có "việc kế tiếp", không đè cấp độ / ví', !!mt.next && !mt.overlap.length && mt.taskFs >= 11, JSON.stringify(mt));
  const tags = await page.evaluate(() => [...VD.lounge.npcs.values()].filter(n => n.tag && n.tag.style.display !== 'none' && n.tag.querySelector('.name').textContent).length);
  check('nhãn tên NPC hiện', tags >= 6, tags);
  await talkTo(page, 700000);
  await shot(page, 'm03-elara-menu');
  const menuFit = await page.evaluate(() => { const r = document.querySelector('.vd-npcmenu-choices').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= 0 && r.right <= innerWidth + 1; });
  check('menu NPC vừa màn', menuFit);
  await pick(page, 'Chiến dịch');
  await waitFor(page, () => document.body.dataset.panel === 'campaign', null, 5000);
  await sleep(200);
  await shot(page, 'm04-campaign');
  const over = await page.evaluate(() => { const el = document.querySelector('.vd-panel'); return el.scrollWidth <= innerWidth + 1; });
  check('bảng Campaign không tràn ngang', over);
  await page.keyboard.press('Escape');
  await talkTo(page, 700008);
  await pick(page, 'Đặc tính');
  await waitFor(page, () => document.body.dataset.panel === 'talent', null, 5000);
  await shot(page, 'm05-talent');
  await page.keyboard.press('Escape');
  await talkTo(page, 700006);
  await pick(page, 'Kho chứa');
  await waitFor(page, () => document.body.dataset.panel === 'stash', null, 5000);
  await shot(page, 'm06-stash');
  await page.keyboard.press('Escape');
  await talkTo(page, 700013);
  await pick(page, 'Đổi Nhân Vật');
  await waitFor(page, () => document.body.dataset.panel === 'charSelect', null, 5000);
  await shot(page, 'm07-charselect');
  return page;
}

// ================================================================ 3. Đánh / skill / trang bị trong sảnh (1280×720, chuột + phím thật)
// Luật gốc: docs/LOUNGE.md §6.2 (SkillSelectPopup) và §1.1 (IsNonCombat, phòng tập 9003).
async function lobbyplay(browser, port, errors) {
  console.log('\n== sảnh: chọn kỹ năng, đánh, trang bị');
  const page = await newPage(browser, 1280, 720, errors);
  const url = `${process.env.VD_BASE || ('http://127.0.0.1:' + port)}/games/voiddiver/index.html`;
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitFor(page, () => document.body.dataset.ready === 'title', null, 60000);
  await page.evaluate(() => { const P = VD.profile; P.reset(); const p = P.get(); p.clears = { 1100: 1, 1101: 1 }; p.isTutorial = false; p.userLevel = 2;
    for (const q of VD.T.LoungeQuest) p.loungeQuest[q.Id] = 4; p.areaUnlocked[3] = true; P.save(); });
  await page.goto(url + '?lounge=1');
  check('sảnh ?lounge=1', await waitFor(page, () => document.body.dataset.lounge === 'play' && VD.stage.pending === 0, null, 240000));
  await sleep(1200);
  const hud = await page.evaluate(() => ({ on: VD.hud.on, vis: getComputedStyle(VD.hud.root).display !== 'none', slots: [...document.querySelectorAll('.vd-skills .vd-skill')].map(e => e.classList.contains('empty') ? 0 : 1).join(''),
    map: !!document.querySelector('.vd-minimap canvas.small') && getComputedStyle(document.querySelector('.vd-minimap')).display !== 'none', lo: VD.stage.loadout, nc: VD.stage.player.nonCombat }));
  check('HUD người chơi hiện ở sảnh (dãy skill LMB/RMB/Space/Q có icon, E/R trống, bản đồ nhỏ)', hud.on && hud.vis && hud.slots === '111100' && hud.map, JSON.stringify(hud));
  check('người chơi ở sảnh mang loadout của hồ sơ, ngoài phòng tập là IsNonCombat', hud.lo.SkillOne === 0 && hud.lo.SkillTwo === 1 && hud.nc === true, JSON.stringify(hud.lo));
  await shot(page, 'p01-lobby-hud');
  // Felix → "Chọn kỹ năng" (F thật, bấm chuột thật)
  check('Felix: menu', await talkTo(page, 700008));
  check('Felix → Chọn kỹ năng', await pick(page, VD_TX_SKILL));
  check('bảng SkillSelectPopup mở', await waitFor(page, () => document.body.dataset.panel === 'charSkill', null, 5000));
  await sleep(300);
  const pop = await page.evaluate(() => ({ slots: document.querySelectorAll('.vd-sks .sl').length, lock: document.querySelectorAll('.vd-sks .sl.lock').length, sel: document.querySelector('.vd-sks .sl.sel').dataset.slot,
    list: [...document.querySelectorAll('.vd-sks .list .sk-info')].map(e => +e.dataset.id), cur: document.querySelectorAll('.vd-sks .list .tag.cur').length }));
  check('4 ô RMB/Q/E/R (E, R khoá: ActiveSlotCount 2), ô RMB chọn sẵn, danh sách xếp theo Id', pop.slots === 4 && pop.lock === 2 && pop.sel === '0' && pop.list.join() === pop.list.slice().sort((a, b) => a - b).join() && pop.cur === 1, JSON.stringify(pop));
  await shot(page, 'p02-skill-popup');
  const at = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30) }; }, sel);
  let p0 = await at('.vd-sks .sl[data-slot="1"]'); await page.mouse.click(p0.x, p0.y); await sleep(200);
  p0 = await at('.vd-sks .list .sk-info[data-id="10010300"]'); await page.mouse.click(p0.x, p0.y); await sleep(300);
  const moved = await page.evaluate(() => [...document.querySelectorAll('.vd-sks .sl')].map(e => e.querySelector('.ic') ? 1 : 0).join(''));
  check('đặt skill đang ở RMB vào Q: RMB bị tháo (không đổi chỗ), có toast', moved === '0100' && await page.evaluate(() => !!document.querySelector('.vd-toast')), moved);
  p0 = await at('.vd-sks .sl[data-slot="0"]'); await page.mouse.click(p0.x, p0.y); await sleep(200);
  p0 = await at('.vd-sks .list .sk-info[data-id="10010600"]'); await page.mouse.click(p0.x, p0.y); await sleep(200);
  await shot(page, 'p03-skill-picked');
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => { if (VD.npc.isOpen()) VD.npc.close(); });
  await sleep(300);
  const lo = await page.evaluate(() => ({ prof: VD.profile.loadout(100001), st: VD.stage.loadout }));
  check('đóng bảng = lưu: hồ sơ và nhân vật ở sảnh đổi ngay (RMB Trảm Hồn, Q Xung Phong)', lo.prof.SkillOne === 3 && lo.prof.SkillTwo === 0 && lo.st.SkillOne === 3 && lo.st.SkillTwo === 0, JSON.stringify(lo));
  // dùng skill bằng phím thật
  const cv = await page.evaluate(() => { const r = VD.render.renderer.domElement.getBoundingClientRect(); return { x: r.x + r.width / 2 + 120, y: r.y + r.height / 2 - 40 }; });
  await page.mouse.move(cv.x, cv.y);
  // (swiftshader chậm: đo giờ game ở sảnh chỉ chạy 0,2–0,4 × giờ thật → chờ theo trạng thái, hạn chờ rộng; hồi chiêu vài giây
  // game có thể mất ~30 s thật)
  await page.mouse.down({ button: 'right' }); await sleep(100); await page.mouse.up({ button: 'right' });
  await waitFor(page, () => (VD.stage.player.cd[10010600] || 0) > 0 && !VD.stage.player.run, null, 40000, 'RMB hồi chiêu');
  await page.keyboard.press('KeyQ');
  await waitFor(page, () => (VD.stage.player.cd[10010300] || 0) > 0, null, 40000, 'Q hồi chiêu');
  await sleep(100);
  const cast = await page.evaluate(() => { const u = VD.stage.player; return { cd: Object.keys(u.cd).filter(k => u.cd[k] > 0).map(Number).sort(), sta: u.stamina, max: u.stats.StaminaMax, st: u.stress,
    cdEl: [...document.querySelectorAll('.vd-skills .vd-skill .cdt')].map(e => e.textContent).join('|') }; });
  check('RMB (chuột phải) + Q ở sảnh: skill chạy, hồi chiêu hiện trên HUD, không tốn thể lực/căng thẳng (IsNonCombat)', cast.cd.join() === '10010300,10010600' && cast.sta === cast.max && cast.st === 0 && /\d/.test(cast.cdEl), JSON.stringify(cast));
  await shot(page, 'p04-cast');
  // phòng tập 9003: bù nhìn gốc, trong TrainingField thì đánh thật
  const dm = await page.evaluate(() => { const ms = VD.stage.units.filter(u => u.kind === 'mon'); const m = ms[0]; VD.lounge.debug.teleport(m.pos.x + 1.1, m.pos.z + 1.1); return { ids: ms.map(u => u.id), hp: m.hp }; });
  check('phòng tập: 5 bù nhìn 8200xx từ Sector 9003', dm.ids.join() === '820001,820002,820004,820006,820007', dm.ids.join());
  await page.keyboard.down('KeyS'); await sleep(150); await page.keyboard.up('KeyS'); await sleep(1300);
  const tgt = await page.evaluate(() => { const m = VD.stage.units.find(u => u.kind === 'mon'); const v = new THREE.Vector3(m.pos.x, 0.6, m.pos.z).project(VD.render.camera); const c = VD.render.renderer.domElement.getBoundingClientRect(); return { x: c.left + (v.x + 1) / 2 * c.width, y: c.top + (1 - v.y) / 2 * c.height }; });
  await page.mouse.move(tgt.x, tgt.y);
  await waitFor(page, () => (VD.stage.player.cd[10010600] || 0) <= 0 && !VD.stage.player.run, null, 60000, 'RMB hồi xong');
  await page.mouse.down({ button: 'right' }); await sleep(100); await page.mouse.up({ button: 'right' });
  await waitFor(page, () => { const m = VD.stage.units.find(u => u.kind === 'mon'); return m.hp < m.stats.HpMax; }, null, 40000, 'bù nhìn mất máu');
  const tr = await page.evaluate(() => { const m = VD.stage.units.find(u => u.kind === 'mon'), u = VD.stage.player; return { nc: u.nonCombat, hp: m.hp, max: m.stats.HpMax }; });
  check('trong TrainingField: không còn IsNonCombat, skill gây sát thương lên bù nhìn', tr.nc === false && tr.hp < tr.max, JSON.stringify(tr));
  await shot(page, 'p05-training');
  // đổi trang bị → áp ngay (chỉ số, skin vũ khí), ô C trong bảng chọn kỹ năng
  const b0 = await page.evaluate(() => ({ uid: VD.stage.player.uid, atk: VD.Stats.get(VD.stage.player, 'Atk') }));
  await page.evaluate(() => { const p = VD.profile.get(); p.equip[100001] = { weapon: 1013, acc: [26011], art: [] }; VD.profile.save(); });
  await sleep(1200);
  const b1 = await page.evaluate(() => { const u = VD.stage.player;
    return { uid: u.uid, atk: VD.Stats.get(u, 'Atk'), weapon: (VD.app.skinsOf(100001, 1013) || []).find(s => /^weapon\//.test(s)), eq: VD.app.equipSkillId(100001) }; });
  check('đổi vũ khí/phụ kiện trong hồ sơ: nhân vật sảnh sinh lại ngay với chỉ số + skin weapon/1013', b1.uid !== b0.uid && b1.atk > b0.atk && b1.weapon === 'weapon/1013', JSON.stringify([b0, b1]));
  await page.evaluate(() => VD.uiChar.openSkill()); await sleep(400);
  const c5 = await page.evaluate(() => document.querySelectorAll('.vd-sks .sl').length);
  p0 = await at('.vd-sks .sl[data-slot="4"]'); await page.mouse.click(p0.x, p0.y); await sleep(200);
  const eqv = await page.evaluate(() => ({ info: +(document.querySelector('.vd-sks .sk-disp .sk-info') || {}).dataset?.id, list: !!document.querySelector('.vd-sks .list'), guide: !!document.querySelector('.vd-sks .eqguide') }));
  check('ô C (skill trang bị) chỉ đọc: hiện thông tin, ẩn danh sách', c5 === 5 && eqv.info === 30010000 && !eqv.list && eqv.guide, JSON.stringify(eqv));
  await shot(page, 'p06-equip-slot');
  await page.keyboard.press('Escape');
  // lặn mang đúng loadout
  const dl = await page.evaluate(() => VD.app.skillLoadout(100001));
  check('toDive dùng cùng loadout (RMB Trảm Hồn, Q Xung Phong)', dl.SkillOne === 3 && dl.SkillTwo === 0, JSON.stringify(dl));
  return page;
}
const VD_TX_SKILL = 'Chọn kỹ năng';

async function lobbybag(browser, port, errors) {
  console.log('\n== sảnh: Tab mở túi đồ + kho');
  const page = await newPage(browser, 1280, 720, errors);
  const url = `${process.env.VD_BASE || ('http://127.0.0.1:' + port)}/games/voiddiver/index.html`;
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitFor(page, () => document.body.dataset.ready === 'title', null, 60000);
  const seed = await page.evaluate(() => {
    const P = VD.profile; P.reset(); const p = P.get(); p.clears = { 1100: 1, 1101: 1 }; p.isTutorial = false; p.userLevel = 2;
    for (const q of VD.T.LoungeQuest) p.loungeQuest[q.Id] = 4;
    const it = VD.T.Item.find(r => r.InventoryCountMax >= 2 && r.InventoryCountMax <= 20);
    const acc = VD.T.Equipment.find(r => r.GoodsType === 'Accessory');
    p.pack = [{ type: 'Item', id: it.Id, count: it.InventoryCountMax }, { type: 'Item', id: it.Id, count: 1 }];
    p.stash = [{ type: 'Equipment', id: acc.Id, count: 1 }, { type: 'Item', id: 10001, count: 5 }];
    P.save();
    return { item: it.Id, max: it.InventoryCountMax, acc: acc.Id };
  });
  const total = () => page.evaluate(() => { const p = VD.profile.get(); return p.pack.concat(p.stash).reduce((a, g) => a + (g.count || 1), 0); });
  const before = await total();
  await page.goto(url + '?lounge=1');
  check('sảnh ?lounge=1', await waitFor(page, () => document.body.dataset.lounge === 'play' && VD.stage.pending === 0, null, 240000));
  await sleep(1200);
  await page.keyboard.press('Tab');
  await sleep(400);
  const open = await page.evaluate(() => {
    const sec = document.querySelector('.vd-inv-loot');
    if (!sec) return { open: !!VD.inventory.open, built: false };
    return { open: !!VD.inventory.open, on: document.querySelector('.vd-inv').classList.contains('on'), stash: sec.classList.contains('stash'),
      vis: getComputedStyle(sec).display !== 'none', title: sec.querySelector('.head b').textContent, cells: sec.querySelectorAll('.grid.loot .vs').length,
      inv: VD.inventory.slots.filter(s => s.g).map(s => s.g.count).join('+') };
  });
  check('Tab thật ở sảnh mở trang Túi đồ', open.open && open.on, JSON.stringify(open));
  check('cột phải là Kho chứa, đủ StashSlotCount ô', open.stash && open.vis && open.title === 'Kho chứa' && open.cells === 60, JSON.stringify(open));
  check('túi nạp nguyên chồng vượt InventoryCountMax (không cắt)', open.inv === seed.max + '+1', open.inv);
  await shot(page, 'b01-lobby-bag');
  if (!open.open) return page;
  const box = await page.evaluate(() => { const r = document.querySelector('.grid.loot .vs').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  const moved = await page.evaluate(acc => VD.inventory.slots.some(s => s.g && s.g.type === 'Equipment' && +s.g.id === acc), seed.acc);
  check('bấm ô kho chuyển món sang túi', moved);
  for (const k of ['KeyE', 'KeyE', 'KeyQ', 'KeyQ']) { await page.keyboard.press(k); await sleep(150); }
  await page.keyboard.press('KeyF');
  await sleep(200);
  check('F trong túi không mở hội thoại NPC', await page.evaluate(() => !(VD.dialog && VD.dialog.open) && !VD.npc.isOpen() && VD.inventory.open));
  await page.keyboard.press('Tab');
  await sleep(300);
  const shut = await page.evaluate(acc => { const p = VD.profile.get(); return { open: !!VD.inventory.open, input: VD.input.enabled,
    packAcc: p.pack.some(g => g.type === 'Equipment' && +g.id === acc), stashAcc: p.stash.some(g => g.type === 'Equipment' && +g.id === acc) }; }, seed.acc);
  check('Tab lần nữa đóng, nhận lại điều khiển', !shut.open && shut.input === true, JSON.stringify(shut));
  check('đóng bảng ghi hồ sơ: món đã sang túi, rời kho', shut.packAcc && !shut.stashAcc, JSON.stringify(shut));
  check('tổng số món không đổi', (await total()) === before, before + ' → ' + (await total()));
  await page.keyboard.press('Tab');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Esc đóng túi ở sảnh', await page.evaluate(() => !VD.inventory.open));
  return page;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    // Đóng trang của phần trước: headless không hãm rAF trang nền — để lại thì mỗi phần thêm một bản game vẽ swiftshader song song.
    const run = async f => { const p = await f(browser, port, errors); if (p && !OPT.keep) await p.close(); };
    if (!OPT.only || OPT.only === 'flow') await run(flow);
    if (!OPT.only || OPT.only === 'mobile') await run(mobile);
    if (!OPT.only || OPT.only === 'lobbyplay') await run(lobbyplay);
    if (!OPT.only || OPT.only === 'lobbybag') await run(lobbybag);
  } catch (e) { check('không ném lỗi', false, e.stack); }
  const uniq = [...new Set(errors)];
  check('không pageerror / console error / HTTP ≥ 400', uniq.length === 0, uniq.slice(0, 12).join('\n      '));
  console.log(`\n${pass} PASS, ${fail} FAIL${fails.length ? ': ' + fails.join('; ') : ''}`);
  console.log('Ảnh: ' + OUT);
  if (!OPT.keep) await browser.close();
  srv.close();
  process.exit(fail ? 1 : 0);
})();
