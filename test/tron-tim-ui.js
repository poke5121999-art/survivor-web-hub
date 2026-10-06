/*
 * Trốn Tìm (games/tron-tim) — kiểm UI gốc: menu, Thời trang, ngôn ngữ, vào trận, HUD, kết trận, phần thưởng, quay lại menu.
 *
 * Chạy:  python -m http.server 8815   (ở gốc repo)   rồi   node test/tron-tim-ui.js
 *   TT_URL=http://localhost:8815/games/tron-tim/index.html   TT_SHOTS=D:/phanminhtam-ref/shots (đặt "" để không chụp)
 * Trang mở ?menu=1&manual=1: qua menu thật nhưng thời gian trận chỉ chạy bằng TT.step(n). Date.now bị đóng băng để năng lượng là số nguyên đoán được.
 * Seed 1..3 đều cho người chơi vai Trốn (kiểm ở mã), nên thắng/thua và vàng là con số cố định.
 */
'use strict';
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const URL = process.env.TT_URL || 'http://localhost:8815/games/tron-tim/index.html';
const SHOTS = process.env.TT_SHOTS === undefined ? 'D:/phanminhtam-ref/shots' : process.env.TT_SHOTS;
const T0 = 1800000000000;   // Date.now đóng băng

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

async function flow(browser, W, H, problems) {
  const tag = W + 'x' + H, sz = W === 1280 ? '1280' : '1920';
  console.log('\n== ' + tag);
  const ctxb = await browser.newContext({ viewport: { width: W, height: H } });
  await ctxb.addInitScript(t0 => { Date.now = () => t0; }, T0);
  const page = await ctxb.newPage();
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  const E = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + '/tt_ui2_' + name + '_' + sz + '.png' }); } };
  const open = async () => {
    await page.goto(URL + '?seed=1&menu=1&manual=1');
    await page.waitForFunction(() => window.__ready && TT.mode === 'menu', null, { timeout: 20000 });
    await page.waitForTimeout(300);
  };
  // bấm giữa một nút của lớp menu (đường dẫn từ gốc prefab), bằng chuột thật
  const clickMenu = async path => {
    const r = await E(path => { const R = TT.menu.layer().rect(path); return R && [(R.x + R.w / 2) / TT.ui.dpr, (R.y + R.h / 2) / TT.ui.dpr]; }, path);
    if (!r) { check('có nút ' + path, false, 'rect null'); return; }
    await page.mouse.click(r[0], r[1]); await page.waitForTimeout(250);
  };
  const clickHud = async path => {
    const r = await E(path => { const R = TT.hud.layer().rect(path); return R && [(R.x + R.w / 2) / TT.ui.dpr, (R.y + R.h / 2) / TT.ui.dpr]; }, path);
    if (!r) { check('có nút HUD ' + path, false, 'rect null'); return; }
    await page.mouse.click(r[0], r[1]); await page.waitForTimeout(250);
  };
  const tapCenter = async () => { await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(250); };
  // chạm màn kết trận: bỏ qua chạm quá sớm (<0.45 s sau khi hiện), lặp tới khi sang bước mong muốn (endStage 2 = màn thưởng, 0 = đã thoát)
  const tapTo = async stage => {
    for (let i = 0; i < 8 && (await E(() => TT.hud.endStage)) !== stage; i++) { await page.waitForTimeout(500); await tapCenter(); }
    return E(() => TT.hud.endStage);
  };
  const P = 'MenuContainer/MainMenu/', CM = 'MenuContainer/CharMenu/PopUp/';
  const save = () => E(() => JSON.parse(JSON.stringify(TT.save.d)));

  // ---------------------------------------------------------------- 1. khởi động
  console.log('khởi động và menu');
  await page.goto(URL + '?seed=1&menu=1&manual=1');
  await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });
  const first = await E(() => TT.mode);
  check('vào đầu là màn tải (loading)', first === 'loading', first);
  await shot('loading');
  await page.waitForFunction(() => TT.mode === 'menu', null, { timeout: 10000 });
  await page.waitForTimeout(400);
  check('sau màn tải là menu', (await E(() => TT.mode)) === 'menu');
  const px = await E(() => { const c = document.getElementById('hud'), x = c.getContext('2d'), d = x.getImageData(c.width / 2, c.height / 2, 1, 1).data; return [d[0], d[1], d[2], d[3]]; });
  check('canvas hud có hình (không trống)', px[3] > 0, px.join(','));
  await shot('menu');

  let d = await save();
  check('mới chơi: cấp 1, 100 năng lượng, 0 vàng, 0 cúp, tên "Bạn"', d.level === 1 && Math.floor(d.energy) === 100 && d.gold === 0 && d.cup === 0 && d.name === 'Bạn', JSON.stringify([d.level, d.energy, d.gold, d.cup, d.name]));
  const hdr = await E(() => { const L = TT.menu.layer(), g = p => L.q('MenuContainer/MainMenu/' + p).txt.s; return [g('Profile/Name'), g('Profile/Level/Text_Level'), g('Cup/Text_Value'), g('Stats_Energy/Text_Value'), g('Stats_Gold/Text_Value')]; });
  check('thanh trên menu hiện giá trị thật', JSON.stringify(hdr) === JSON.stringify(['Bạn', '1', '0', '100/100', '0']), JSON.stringify(hdr));
  const qp = await E(() => TT.menu.layer().q('MenuContainer/MainMenu/btnPlayReal/Button_Lobby_QuickPlay/Text_Battle').txt.s);
  check('nút Chơi Ngay đúng tiếng Việt', qp === 'Chơi Ngay', qp);

  // nút chỉ có online: toast
  await clickMenu(P + 'btnPlayReal/Button_Lobby_Join');
  const toast1 = await E(() => { const L = TT.menu.layer(), n = L.q('PopupAlert'); return [!n.off, L.q('PopupAlert/AlertTextText (TMP)').txt.s]; });
  check('Tham gia: toast "Chế độ solo: chưa có"', toast1[0] && toast1[1] === 'Chế độ solo: chưa có', JSON.stringify(toast1));
  await clickMenu(P + 'Button_Shop');
  check('Cửa hàng: cũng toast, vẫn ở menu', (await E(() => TT.mode)) === 'menu');

  // ---------------------------------------------------------------- 2. ngôn ngữ
  console.log('ngôn ngữ');
  await clickMenu(P + 'Button_Setting');
  await shot('settings');
  await clickMenu(P + 'PopupSetting/Popup/Group_Right/List2/btnEnglish');
  const qpEn = await E(() => TT.menu.layer().q('MenuContainer/MainMenu/btnPlayReal/Button_Lobby_QuickPlay/Text_Battle').txt.s);
  check('bật English: nút thành QUICK PLAY', qpEn === 'QUICK PLAY', qpEn);
  await page.reload(); await page.waitForFunction(() => window.__ready && TT.mode === 'menu', null, { timeout: 20000 });
  const langKept = await E(() => [TT.save.d.lang, TT.menu.layer().q('MenuContainer/MainMenu/btnPlayReal/Button_Lobby_QuickPlay/Text_Battle').txt.s]);
  check('ngôn ngữ giữ sau khi tải lại trang', langKept[0] === 'en' && langKept[1] === 'QUICK PLAY', JSON.stringify(langKept));
  await clickMenu(P + 'Button_Setting');
  await clickMenu(P + 'PopupSetting/Popup/Group_Right/List2/btnVN');
  const qpVi = await E(() => TT.menu.layer().q('MenuContainer/MainMenu/btnPlayReal/Button_Lobby_QuickPlay/Text_Battle').txt.s);
  check('trở lại Tiếng Việt: Chơi Ngay', qpVi === 'Chơi Ngay', qpVi);
  // cài đặt: nhạc/tiếng/rung và chất lượng
  await clickMenu(P + 'PopupSetting/Popup/Group_Left/MUSIC/Button (1)');
  await clickMenu(P + 'PopupSetting/Popup/Group_Left/SoundFX/Button');
  await clickMenu(P + 'PopupSetting/Popup/Group_Left/Vibration/Button (2)');
  await clickMenu(P + 'PopupSetting/Popup/Group_Right/List/ButtonNext');
  d = await save();
  check('cài đặt: tắt nhạc/tiếng/rung, chất lượng 2 -> 0 (vòng)', d.settings.music === 0 && d.settings.sfx === 0 && d.settings.vib === 0 && d.settings.quality === 0, JSON.stringify(d.settings));
  await clickMenu(P + 'PopupSetting/Popup/Group_Left/MUSIC/Button (1)');
  await clickMenu(P + 'PopupSetting/Popup/Group_Left/SoundFX/Button');
  await clickMenu(P + 'PopupSetting/Popup/Group_Left/Vibration/Button (2)');
  await clickMenu(P + 'PopupSetting/Popup/Group_Right/List/ButtonBack');
  await clickMenu(P + 'PopupSetting/Popup/Button_Close (2)');

  // ---------------------------------------------------------------- 3. thời trang
  console.log('thời trang (CharMenu)');
  await clickMenu(P + 'Button_Char');
  await shot('charmenu');
  const nm0 = await E(() => TT.menu.layer().q('MenuContainer/CharMenu/PopUp/bg/Name').txt.s);
  check('CharMenu mở, nhân vật đầu hiện tên', nm0 === 'Sát Thủ', nm0);
  const sk0 = await E(() => TT.menu.layer().q('MenuContainer/CharMenu/PopUp/TapMenu_1/skill/skill1/Image/effect1').txt.s);
  check('hiện tên + mô tả kỹ năng từ TT.SKILLS', /Tàng Hình/.test(sk0), sk0.slice(0, 40));
  await clickMenu(CM + 'ButtonNext'); await clickMenu(CM + 'ButtonNext');
  await clickMenu(CM + 'ButtonUse');
  d = await save();
  check('chọn Xạ Thủ (ranger) cho vai Trốn, lưu lại', d.hero.hide === 'ranger', JSON.stringify(d.hero));
  await clickMenu(CM + 'ButtonSwitch');
  const nmSeek = await E(() => TT.menu.layer().q('MenuContainer/CharMenu/PopUp/bg/Name').txt.s);
  check('đổi sang vai Tìm: hiện Người Máy', nmSeek === 'Người Máy', nmSeek);
  await shot('charmenu_seek');
  await clickMenu(CM + 'ButtonSwitch'); await clickMenu(CM + 'ButtonExit');

  // bảng xếp hạng + nhiệm vụ
  await clickMenu(P + 'ContainerButton/ButtonRank');
  const rk = await E(() => TT.menu.layer().q('MenuContainer/Lobby_Panel_Ranking/PlayerRankItem/Text_NickName').txt.s);
  check('bảng xếp hạng hiện tên của mình', rk === 'Bạn', rk);
  await shot('rank');
  await clickMenu('MenuContainer/Lobby_Panel_Ranking/Top_Menu/Button_Back');
  await clickMenu(P + 'ContainerButton/ButtonQuest');
  await shot('quests');
  await clickMenu('MenuContainer/Lobby_Panel_Missions/Top/Button_Back');
  check('đóng cửa sổ: về menu chính', (await E(() => TT.menu.layer().scope)) === 'main');

  // ---------------------------------------------------------------- 4. trận 1: thua (người tìm bắt hết)
  console.log('trận 1 (seed 1): vào trận, HUD, thua');
  await clickMenu(P + 'btnPlayReal/Button_Lobby_QuickPlay');
  check('Chơi Ngay: vào trận', (await E(() => TT.mode)) === 'match');
  d = await save();
  check('năng lượng 100 -> 80', Math.floor(d.energy) === 80, d.energy);
  const m1 = await E(() => ({ role: TT.M.human.role, hero: TT.M.human.hero, dis: TT.M.human.disguise, seed: TT.M.seed }));
  check('seed 1, người chơi là Trốn và dùng nhân vật đã chọn (ranger)', m1.role === 'hide' && m1.hero === 'ranger' && m1.dis === 'ranger' && m1.seed === 1, JSON.stringify(m1));
  await E(() => TT.step(30)); await shot('intro');
  check('intro: hiện chữ vai Trốn', await E(() => TT.hud.visible('HideRole') && !TT.hud.visible('SeekRole')));
  await E(() => TT.step(480));   // 8.5 s: pha countdown đã 5.5 s, 3-2-1-GO đang đếm
  const cdn = await E(() => [TT.M.phase, TT.hud.visible('StartGameUI'), TT.hud.visible('StartGameUI/Text (1)')]);
  check('đếm ngược: StartGameUI hiện số "2" lúc 5.5 s', cdn[0] === 'countdown' && cdn[1] && cdn[2], JSON.stringify(cdn));
  await shot('countdown');
  await E(() => { TT.skipTo('playing'); TT.step(60); });
  check('đang chơi: TimeUI hiện "2:29"', (await E(() => TT.hud.text('TimeUI (1)/TimeText'))) === '2:29');
  check('đang chơi: đếm hai đội 7 người trốn / 3 người tìm', (await E(() => [TT.hud.text('InfoMatchNew/Hide/Text'), TT.hud.text('InfoMatchNew/Seek/Text')])).join('/') === '7/3');
  check('5 s đầu: Seekers thức tỉnh + số 4', await E(() => TT.hud.visible('TextSeekerAppear') && TT.hud.text('TimeSeekerAppear') === '4'));
  await shot('seekers_appear');
  await E(() => { TT.M.actors.forEach(a => { if (a.isBot) TT.addEffect(a, 'freeze', 1e9); }); TT.step(60 * 20); });
  const mid = await E(() => [TT.hud.visible('TextSeekerAppear'), TT.hud.text('TimeUI (1)/TimeText'), TT.hud.visible('scanUI')]);
  check('sau 21 s: hết chữ Seekers, đồng hồ 2:09, rađa quét hiện', mid[0] === false && mid[1] === '2:09' && mid[2] === true, JSON.stringify(mid));
  await shot('playing');
  // Home -> PopupExit -> KHÔNG
  await clickHud('TurnOn/Home');
  check('Home: PopupExit mở và trận tạm dừng', await E(() => TT.hud.exitOpen() && TT.ui.paused));
  await shot('exit_popup');
  await clickHud('TurnOn/PopupExit/Popup/ButtonNot');
  check('KHÔNG: đóng popup, tiếp tục', await E(() => !TT.hud.exitOpen() && !TT.ui.paused && TT.mode === 'match'));
  // kỹ năng hiện nút
  const skb = await E(() => TT.hud.visible('SkillBtn'));
  check('nút kỹ năng hiện (kỹ năng Xạ Thủ từ TT.SKILLS)', skb === true);
  // cổng chuẩn bị mở
  await E(() => TT.step(60 * 115));   // t ~ 136: cổng đếm 15 s đã bắt đầu từ 135
  const gate = await E(() => [TT.M.gate.state, TT.hud.visible('10sOpenDoor (1)'), TT.hud.text('10sOpenDoor (1)/10')]);
  check('cổng đang đếm: hiện "CỔNG CHUẨN BỊ MỞ!" + số', gate[0] === 'counting' && gate[1] === true && /^\d+$/.test(gate[2]), JSON.stringify(gate));
  await shot('gate_countdown');
  // thua: người tìm bắt hết người trốn ở t ~ 136 s
  await E(() => { for (const a of TT.M.actors) if (a.role === 'hide') a.life = 'downed'; TT.step(3); });
  const r1 = await E(() => [TT.M.phase, TT.M.result && TT.M.result.winner, TT.M.t]);
  check('kết quả: người tìm thắng', r1[0] === 'ending' && r1[1] === 'seek', JSON.stringify(r1));
  await E(() => TT.step(60 * 3));
  const clock1 = await E(() => Math.ceil(TT.clockOf(TT.M) - 1e-9));
  await shot('lose_panel');
  check('LosePanel hiện (tiêu đề THUA), chưa phát thưởng ra màn kết quả', await E(() => TT.hud.endStage === 2 ? false : TT.hud.endStage === 1));
  check('chạm: sang màn thưởng (ResultLose)', (await tapTo(2)) === 2);
  const rw1 = await E(() => TT.hud.reward());
  // clock còn lại ~14 s -> gold = trunc(50 + (390-14)/10) = 87
  const goldExp1 = Math.trunc(50 + (390 - clock1) / 10);
  check('thưởng thua: vàng = trunc(50+(390-t)/10), exp 50, cúp +5', rw1.win === false && rw1.gold === goldExp1 && rw1.exp === 50 && rw1.cup === 5 && rw1.clock === clock1, JSON.stringify(rw1));
  check('literal: t=' + clock1 + ' -> thua được 87 vàng', clock1 === 14 && rw1.gold === 87, rw1.gold);
  await shot('result_lose');
  await tapTo(0); await page.waitForTimeout(500);
  check('chạm: về menu', (await E(() => TT.mode)) === 'menu');
  d = await save();
  check('menu sau trận 1: vàng 87, cúp 5, exp 50, cấp 1, năng lượng 80', d.gold === 87 && d.cup === 5 && d.exp === 50 && d.level === 1 && Math.floor(d.energy) === 80, JSON.stringify([d.gold, d.cup, d.exp, d.level, d.energy]));
  const hdr2 = await E(() => { const L = TT.menu.layer(), g = p => L.q('MenuContainer/MainMenu/' + p).txt.s; return [g('Cup/Text_Value'), g('Stats_Energy/Text_Value'), g('Stats_Gold/Text_Value')]; });
  check('thanh trên menu cập nhật: 5 / 80/100 / 87', JSON.stringify(hdr2) === JSON.stringify(['5', '80/100', '87']), JSON.stringify(hdr2));
  await shot('menu_after');

  // ---------------------------------------------------------------- 5. trận 2 (seed 2): thắng, lên cấp, nhiệm vụ
  console.log('trận 2 (seed 2): thắng');
  await clickMenu(P + 'btnPlayReal/Button_Lobby_QuickPlay');
  const m2 = await E(() => ({ role: TT.M.human.role, seed: TT.M.seed, energy: TT.save.energy() }));
  check('trận 2: seed 2, vai Trốn, năng lượng 60', m2.role === 'hide' && m2.seed === 2 && m2.energy === 60, JSON.stringify(m2));
  await E(() => { TT.skipTo('playing'); TT.M.actors.forEach(a => { if (a.isBot) TT.addEffect(a, 'freeze', 1e9); }); TT.step(60 * 30); });
  await E(() => { const m = TT.M; m.gate.state = 'open'; m.human.x = m.gate.x; m.human.y = m.gate.y; TT.step(5); });
  const r2 = await E(() => [TT.M.phase, TT.M.result && TT.M.result.winner]);
  check('kết quả: người trốn thoát qua cổng', r2[0] === 'ending' && r2[1] === 'hide', JSON.stringify(r2));
  await E(() => TT.step(60 * 3)); await shot('win_panel');
  const clock2 = await E(() => Math.ceil(TT.clockOf(TT.M) - 1e-9));
  check('chạm: sang màn thưởng (ResultWin)', (await tapTo(2)) === 2);
  await page.waitForTimeout(1800); await shot('result_win');
  const rw2 = await E(() => TT.hud.reward());
  const goldExp2 = Math.trunc(50 + (390 - clock2) / 10 + 25);
  check('thưởng thắng: vàng = trunc(50+(390-t)/10+25), exp 75, cúp +10', rw2.win === true && rw2.gold === goldExp2 && rw2.exp === 75 && rw2.cup === 10, JSON.stringify(rw2));
  check('literal: t=' + clock2 + ' -> thắng được 102 vàng, lên cấp 2 (+100 vàng)', clock2 === 120 && rw2.gold === 102 && rw2.levelUp && rw2.levelGold === 100 && rw2.level1 === 2, JSON.stringify(rw2));
  await tapTo(0); await page.waitForTimeout(500);
  d = await save();
  check('menu sau trận 2: vàng 289 (87+102+100), cúp 15, cấp 2, exp 72.5, năng lượng 60', d.gold === 289 && d.cup === 15 && d.level === 2 && d.exp === 72.5 && Math.floor(d.energy) === 60, JSON.stringify([d.gold, d.cup, d.level, d.exp, d.energy]));
  check('nhiệm vụ ngày: 2 trận, 1 thắng', d.daily.match === 2 && d.daily.win === 1, JSON.stringify(d.daily));
  // nhận thưởng nhiệm vụ "Ván đầu trong ngày" (150 vàng)
  await clickMenu(P + 'ContainerButton/ButtonQuest');
  await shot('quests_done');
  await clickMenu('MenuContainer/Lobby_Panel_Missions/Group_Left/ScrollRect/Content/ListQuestItem/ListQuestFinish/claimBtn/Button_Claim_Green');
  d = await save();
  check('nhận nhiệm vụ đầu ngày: +150 vàng', d.gold === 439 && d.daily.claimed[0] === true, d.gold);
  await clickMenu('MenuContainer/Lobby_Panel_Missions/Top/Button_Back');

  // ---------------------------------------------------------------- 6. nhân vật đổi có hiệu lực ở trận sau + thoát phòng
  console.log('trận 3: nhân vật đã chọn, thoát phòng');
  await clickMenu(P + 'Button_Char');
  await clickMenu(CM + 'ButtonNext');   // idx: ranger(2) -> trapmaster(3)
  await clickMenu(CM + 'ButtonUse'); await clickMenu(CM + 'ButtonExit');
  await clickMenu(P + 'btnPlayReal/Button_Lobby_QuickPlay');
  const m3 = await E(() => ({ hero: TT.M.human.hero, seed: TT.M.seed, energy: TT.save.energy() }));
  check('trận 3: nhân vật Bậc Thầy Bẫy (đổi ở Thời trang) và năng lượng 40', m3.hero === 'trapmaster' && m3.seed === 3 && m3.energy === 40, JSON.stringify(m3));
  await E(() => TT.skipTo('playing'));
  await clickHud('TurnOn/Home'); await clickHud('TurnOn/PopupExit/Popup/ButtonAccept');
  check('Home -> CÓ: về menu, không phát thưởng', await E(() => TT.mode === 'menu' && TT.save.d.stats.match === 2));

  // ---------------------------------------------------------------- 7. hết năng lượng, mua năng lượng
  console.log('năng lượng');
  await E(() => { TT.save.d.energy = 10; TT.save.persist(); TT.menu.refresh(); });
  await clickMenu(P + 'btnPlayReal/Button_Lobby_QuickPlay');
  check('dưới 20 năng lượng: không vào trận, mở PopupEnergy', await E(() => TT.mode === 'menu' && TT.menu.layer().scope === 'energy'));
  await shot('energy_popup');
  await clickMenu(P + 'PopupEnergy/Popup/Button_Buy');
  d = await save();
  check('mua năng lượng: -1000 vàng? (không đủ vàng: giữ nguyên)', d.gold === 439 && Math.floor(d.energy) === 10, JSON.stringify([d.gold, d.energy]));
  await E(() => { TT.save.d.gold = 1500; });
  await clickMenu(P + 'PopupEnergy/Popup/Button_Buy');
  d = await save();
  check('đủ vàng: -1000 vàng, +50 năng lượng', d.gold === 500 && Math.floor(d.energy) === 60, JSON.stringify([d.gold, d.energy]));
  check('mua đủ năng lượng: popup tự đóng', (await E(() => TT.menu.layer().scope)) === 'main');

  // năng lượng hồi khi đóng trang: +2 mỗi phút
  await E(t0 => { TT.save.d.energy = 40; TT.save.d.energyAt = t0 - 10 * 60 * 1000; TT.save.persist(); }, T0);
  await page.reload(); await page.waitForFunction(() => window.__ready && TT.mode === 'menu', null, { timeout: 20000 });
  check('hồi năng lượng offline: 40 + 10 phút * 2 = 60', (await E(() => TT.save.energy())) === 60);

  // ---------------------------------------------------------------- 8. cảm ứng: joystick + nút
  console.log('cảm ứng');
  await E(() => { TT.startMatch({ humanRole: 'seek' }); TT.skipTo('playing'); TT.step(60 * 7); SK.input.touchMode = true; Object.assign(SK.input.stick, { active: true, ox: 200, oy: 500, x: 240, y: 520 }); });
  await page.waitForTimeout(400);
  check('cảm ứng, người tìm: ActionBtn hiện', await E(() => TT.hud.visible('ActionBtn')));
  await shot('touch_seek');
  await E(() => { SK.input.stick.active = false; });
  await ctxb.close();
}

async function main() {
  const browser = await chromium.launch();
  const problems = [];
  await flow(browser, 1280, 720, problems);
  check('1280x720: không console error / pageerror / request lỗi', problems.length === 0, problems.slice(0, 3).join(' | '));
  const n0 = problems.length;
  await flow(browser, 1920, 1080, problems);
  check('1920x1080: không console error / pageerror / request lỗi', problems.length === n0, problems.slice(n0, n0 + 3).join(' | '));
  await browser.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log('FAIL (ngoại lệ) ' + (e && e.stack || e)); process.exit(1); });
