/*
 * Kiểm thử gục ngã → hồi sinh → bảng tổng kết → về sảnh (games/soulknight/js/gameover.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-gameover.js
 * Biến môi trường: SK_URL (mặc định http://localhost:8811/games/soulknight/index.html), SK_SHOTS (thư mục ảnh).
 *
 * Vào 1-1 bằng ?quick=1, cho nhân vật gục: hộp hồi sinh gốc (window_reborn) phải hiện với giá 200 Ngọc; bấm nút Ngọc
 * thì trừ 200, dậy đầy máu. Gục lần nữa: nút Ngọc xám (mỗi ván một lần), bấm thoát → bảng tổng kết trang 1 (thước, nhãn
 * 1-1), bấm ▶ → trang 2 trượt vào (info.x = -1280), bấm ▶ → về sảnh, đá quý hồ sơ tăng đúng số trên bảng.
 * Cuối cùng thử nhánh thắng: qua cổng 3-5 → cùng bảng, tiêu đề "Thắng".
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-gameover');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const errs = [];
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(80);
  }
  return false;
}
async function clickNode(p, nodePath) {
  const r = await p.evaluate(q => SK.gameover.rect(q), nodePath);
  if (!r) throw new Error('node has no rect: ' + nodePath);
  await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
}
const kill = p => p.evaluate(() => { const G = SK.G; SK_GAME.debug.god(false); G.player.god = false; G.player.invulT = 0; G.player.armor = 0; SK.hurtPlayer(G, 99); });
const st = p => p.evaluate(() => SK.gameover.state());

async function main(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  errs.length = 0;
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400) errs.push('http ' + r.status() + ' ' + r.url()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => { SK_GAME.debug.seed(20261014); SK.profile.addGems(1000 - SK.profile.gems); });
  const g0 = await p.evaluate(() => SK.profile.gems);
  await p.click('#sk-start');
  const in11 = await until(p, () => SK_GAME.state === 'stage' && SK_GAME.stage === '1-1' && SK_GAME.phase === 'play', null, 8000);
  check('vào 1-1 bằng ?quick=1', in11, 'đá quý đầu ván ' + g0);

  // ---- gục lần 1: hộp hồi sinh
  await kill(p);
  const shown = await until(p, () => { const s = SK.gameover.state(); return s.phase === 'reborn' && s.rebornY === 0 && s.t > 0.5; }, null, 6000);
  const s1 = await st(p);
  const st1 = await p.evaluate(() => SK_GAME.state);
  await p.screenshot({ path: path.join(SHOTS, 'web_revive.png') });
  check('gục → hộp hồi sinh window_reborn trượt vào, giá 200 Ngọc, nút sáng', shown && st1 === 'dead' && s1.gemCost === '200' && s1.gemGray === false,
    JSON.stringify({ st1, phase: s1.phase, cost: s1.gemCost, gray: s1.gemGray }));
  const html = await p.evaluate(() => !document.getElementById('sk-over').hidden);
  check('Chế độ Ải không còn dùng lớp phủ HTML #sk-over', !html);

  // ---- bấm nút Ngọc: hồi sinh
  await clickNode(p, 'window_reborn/img_bg/btn_bg/btn_gem');
  await sleep(200);
  const rv = await p.evaluate(() => ({ gems: SK.profile.gems, pl: SK_GAME.player, state: SK_GAME.state }));
  check('bấm Ngọc 200 → trừ 200, dậy tại chỗ đầy máu/giáp/năng lượng, ván tiếp tục',
    rv.gems === g0 - 200 && rv.pl.st === 'alive' && rv.pl.hp === rv.pl.hpMax && rv.pl.armor === rv.pl.armorMax && rv.pl.energy === rv.pl.energyMax && rv.state === 'stage',
    JSON.stringify({ gems: rv.gems, hp: rv.pl.hp + '/' + rv.pl.hpMax, armor: rv.pl.armor, en: rv.pl.energy + '/' + rv.pl.energyMax, state: rv.state }));
  await sleep(500);
  const gone = await st(p);
  check('hộp hồi sinh trượt ra và tắt', !gone.active, JSON.stringify(gone.phase));

  // ---- gục lần 2: hết lượt Ngọc, thoát (có số quái hạ và vàng để bảng có đá thưởng)
  await p.evaluate(() => { SK.G.kills = 7; SK.G.player.gold = 30; });
  await kill(p);
  await until(p, () => { const s = SK.gameover.state(); return s.phase === 'reborn' && s.rebornY === 0 && s.t > 0.5; }, null, 6000);
  const s2 = await st(p);
  check('gục lần 2: hộp hiện lại, nút Ngọc xám (một lần mỗi ván)', s2.phase === 'reborn' && s2.gemGray === true, JSON.stringify({ gray: s2.gemGray }));
  await clickNode(p, 'window_reborn/img_bg/btn_bg/btn_gem');   // bấm nút xám: không có gì xảy ra
  const still = await p.evaluate(() => ({ gems: SK.profile.gems, ph: SK.gameover.state().phase }));
  check('bấm nút Ngọc xám không trừ đá, không hồi sinh', still.gems === g0 - 200 && still.ph === 'reborn', JSON.stringify(still));
  // Đếm ngược 5 s của trang 1 chạy theo thời gian game; chụp ảnh chậm có thể để nó tự sang trang 2 trước cú bấm ▶,
  // nên ở đây kéo dài (nhánh thắng bên dưới kiểm việc tự sang trang với 5 s gốc).
  await p.evaluate(() => { SK.gameover.counter = 60; });
  await clickNode(p, 'window_reborn/img_bg/btn_bg/btn_close');
  const p1 = await until(p, () => { const s = SK.gameover.state(); return s.phase === 'statement' && s.page === 0; }, null, 3000);
  await until(p, () => SK.gameover.state().t > 1.4, null, 4000);   // số đá đếm xong (trang 1 tự sang trang 2 sau 5 s)
  const t1 = await st(p);
  const gAfter = await p.evaluate(() => SK.profile.gems);
  await p.screenshot({ path: path.join(SHOTS, 'web_gameover_progress.png') });
  check('thoát → bảng tổng kết trang 1: tiêu đề "GAME OVER", nhân vật ở vạch 1-1, +đá theo tiến độ',
    p1 && t1.title === 'GAME OVER' && t1.label === '1-1' && t1.infoX === 0 && t1.gemText === '+' + t1.run.gemsStage,
    JSON.stringify({ title: t1.title, label: t1.label, gem: t1.gemText, total: t1.total }));
  check('đá quý thưởng đã cộng vào hồ sơ (runEnd của lobby.js)', gAfter === g0 - 200 + t1.run.gems && t1.run.gems > 0,
    (g0 - 200) + ' + ' + t1.run.gems + ' = ' + gAfter);

  // ---- ▶ → trang 2
  await clickNode(p, 'mask_down/btn_ok');
  await until(p, () => { const s = SK.gameover.state(); return s.page === 1 && s.infoX === -1280 && s.gemText === '+' + s.run.gems; }, null, 6000);
  const t2 = await st(p);
  await p.screenshot({ path: path.join(SHOTS, 'web_results_stats.png') });
  check('▶ → trang 2 trượt vào (info.x = -1280), +đá tổng, ô góc = tổng hồ sơ',
    t2.page === 1 && t2.infoX === -1280 && t2.gemText === '+' + t2.run.gems && t2.total === String(gAfter),
    JSON.stringify({ x: t2.infoX, gem: t2.gemText, total: t2.total, kills: t2.run.kills, gold: t2.run.gold, time: t2.run.time.toFixed(1) }));

  // ---- ▶ → về sảnh (tắt QUICK để đi đúng nhánh sảnh như khi chơi thật)
  await p.evaluate(() => { SK.QUICK = false; });
  await clickNode(p, 'mask_down/btn_ok');
  const hall = await until(p, () => SK_GAME.state === 'hall' && !SK.gameover.state().active, null, 3000);
  const fin = await p.evaluate(() => ({ state: SK_GAME.state, gems: SK.profile.gems, dlg: !document.getElementById('hs-modal').hidden }));
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'web_back_hall.png') });
  check('▶ trang 2 → về sảnh, không mở thêm hộp "Kết quả" HTML, đá quý tăng so với sau hồi sinh',
    hall && !fin.dlg && fin.gems > g0 - 200 && fin.gems === gAfter, JSON.stringify(fin));

  // ---- nhánh thắng: qua cổng 3-5
  await p.evaluate(() => { SK.gameover.counter = 5; SK.startRun('knight'); });
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  await p.evaluate(() => { SK_GAME.debug.stage('3-5'); SK_GAME.debug.god(true); });
  await sleep(300);
  await p.evaluate(() => { const G = SK.G; G.hold = false; G.phase = 'portal'; G.phaseT = 5; });
  const win = await until(p, () => { const s = SK.gameover.state(); return SK_GAME.state === 'victory' && s.phase === 'statement'; }, null, 3000);
  await until(p, () => SK.gameover.state().t > 1.4, null, 4000);
  const tw = await st(p);
  await p.screenshot({ path: path.join(SHOTS, 'web_victory.png') });
  check('qua cổng 3-5 → cùng bảng tổng kết, tiêu đề "VICTORY", nhân vật ở vạch 3-5, không hiện #sk-win',
    win && tw.title === 'VICTORY' && tw.label === '3-5' && await p.evaluate(() => document.getElementById('sk-win').hidden),
    JSON.stringify({ title: tw.title, label: tw.label, gem: tw.gemText }));
  const auto = await until(p, () => { const s = SK.gameover.state(); return s.page === 1 && s.infoX === -1280; }, null, 15000);
  check('trang 1 tự sang trang 2 khi đếm ngược 5 s về 0', auto, JSON.stringify({ t: (await st(p)).t.toFixed(2) }));
  await p.keyboard.press('Enter');
  const back2 = await until(p, () => SK_GAME.state === 'hall', null, 3000);
  check('Enter ở trang 2 → về sảnh', back2, await p.evaluate(() => SK_GAME.state));

  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const guard = setTimeout(() => { console.log('quá giờ 180 s'); process.exit(2); }, 180000);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try { await main(b); } catch (e) { check('chạy trọn', false, e.message.split('\n')[0] + (errs.length ? ' · ' + errs.slice(0, 3).join(' | ') : '')); }
  await b.close();
  clearTimeout(guard);
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
