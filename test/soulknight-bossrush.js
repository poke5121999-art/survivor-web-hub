/*
 * Khu Thí Luyện đợt 2 (games/soulknight/js/bossrush2.js): Thí Luyện Thuần Túy, lính Tước Sĩ, vé Lông Vũ Valkyrie, trùm tầng 4 trong bể.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-bossrush.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-bossrush/.
 *
 * 1. Lính e_bossrush_minion_a..d có định nghĩa, sinh được, đúng loại vũ khí; Tước Sĩ gọi đủ lính, đợt sau mạnh hơn 7%.
 * 2. Vé: 3 lông vũ đầu, mỗi vào cửa tốn 1 lông vũ + 1 lượt, 3 lượt/ngày, hết thì chặn; nhiệm vụ treo thưởng "thu thập" thưởng 2 lông vũ.
 * 3. Thuần Túy qua đường thật (cổng 3-5, thắng thật): đạt thì mở Tước Sĩ + đá quý gấp đôi; nhặt vũ khí / chọn thiên phú / quá giờ thì không mở và giảm một nửa.
 * 4. Trùm tầng 4 vào bể: ải 3-x đổi vùng tầng 4 thì trùm là trùm tầng 4.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-bossrush');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
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

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (fn, arg) => p.evaluate(fn, arg);

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });

  // ---- 2. vé Lông Vũ Valkyrie (trong sảnh, chưa vào ván)
  await ev(() => SK.bossrush2.reset());
  const v0 = await ev(() => { const B = SK.bossrush2; return { f: B.feathers(), l: B.left(), c: B.canEnter() }; });
  check('vé: hồ sơ mới có 3 lông vũ, 3 lượt hôm nay, vào được', v0.f === 3 && v0.l === 3 && v0.c === null, JSON.stringify(v0));
  const v1 = await ev(() => { const B = SK.bossrush2; B.spend(); return { f: B.feathers(), l: B.left() }; });
  check('vé: vào một lần tốn 1 lông vũ và 1 lượt', v1.f === 2 && v1.l === 2, JSON.stringify(v1));
  await ev(() => { SK.emit('bounty', SK.G, { type: 'defeat' }); });
  const v2 = await ev(() => SK.bossrush2.feathers());
  check('vé: treo thưởng "đánh bại" không thưởng lông vũ', v2 === 2, 'f ' + v2);
  await ev(() => { SK.emit('bounty', SK.G, { type: 'collect' }); });
  const v3 = await ev(() => SK.bossrush2.feathers());
  check('vé: treo thưởng "thu thập" thưởng thêm 2 lông vũ', v3 === 4, 'f ' + v3);
  // hộp thoại Valkyrie
  await ev(() => { window.__go = 0; SK.bossrush2.ask(() => { window.__go++; window.__pure = SK.bossrush2.nextPure; }); });
  const dlg = await ev(() => ({ txt: document.getElementById('br-feather').textContent, en: !document.getElementById('br-enter').disabled, pu: !document.getElementById('br-pure').disabled }));
  check('hộp thoại Valkyrie: hiện số lông vũ và lượt, hai nút vào đều bấm được', /4/.test(dlg.txt) && /2/.test(dlg.txt) && dlg.en && dlg.pu, JSON.stringify(dlg));
  await ev(() => document.getElementById('br-pure').click());
  const v4 = await ev(() => ({ go: window.__go, pure: window.__pure, f: SK.bossrush2.feathers(), l: SK.bossrush2.left() }));
  check('bấm Thí Luyện Thuần Túy: trừ vé, vào ván với cờ thuần túy', v4.go === 1 && v4.pure === true && v4.f === 3 && v4.l === 1, JSON.stringify(v4));
  await ev(() => { SK.bossrush2.nextPure = false; SK.bossrush2.spend(); });   // lượt thứ ba
  await ev(() => SK.bossrush2.ask(() => { window.__go = 99; }));
  const dlg2 = await ev(() => ({ en: !document.getElementById('br-enter').disabled, bad: (document.getElementById('br-short') || {}).textContent }));
  await p.screenshot({ path: path.join(SHOTS, 'ticket-daily.png') });
  check('hết 3 lượt trong ngày: nút vào khoá kèm lời báo', !dlg2.en && /tối đa/.test(dlg2.bad || ''), JSON.stringify(dlg2));
  await ev(() => { SK.lobby.closeDialog(); SK.bossrush2.reset(); SK.bossrush2.addFeather(-3); });
  const v5 = await ev(() => { const B = SK.bossrush2; return { f: B.feathers(), c: B.canEnter() }; });
  await ev(() => SK.bossrush2.ask(() => {}));
  const dlg3 = await ev(() => ({ en: !document.getElementById('br-enter').disabled, bad: (document.getElementById('br-short') || {}).textContent }));
  await p.screenshot({ path: path.join(SHOTS, 'ticket-none.png') });
  check('hết lông vũ: chặn, nhắc đi tìm Cảnh Sát', v5.f === 0 && v5.c === 'feather' && !dlg3.en && /Cảnh Sát/.test(dlg3.bad || ''), JSON.stringify({ v5, dlg3 }));
  await ev(() => { SK.lobby.closeDialog(); SK.bossrush2.reset(); });
  const day = await ev(() => { const B = SK.bossrush2; B.spend(); B.spend(); B.spend(); const a = B.left(); SK.profile.shiftDay && SK.profile.shiftDay(1); return { a, b: B.left() }; });
  check('hết lượt hôm nay thì qua ngày mới có lại 3 lượt', day.a === 0 && day.b === 3, JSON.stringify(day));
  await ev(() => SK.bossrush2.reset());

  // ---- helpers ván
  const fresh = async (pure, opt) => {
    opt = opt || {};
    await ev(o => {
      SK.bossDebug.force = null; SK.bossDebug.hold = false;
      SK.lobby.enter(); SK_GAME.debug.seed(o.seed || 31);
      SK.bossrush2.f4Rate = o.f4 || 0; SK.bossrush2.nextPure = !!o.pure;
      SK.lobby.launch('knight', 'bossrush');
    }, { pure, seed: opt.seed, f4: opt.f4 });
    return until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play' && SK.G.mode === 'bossrush', null, 12000);
  };
  const stageTo = async (label, tele) => {
    await ev(l => { if (SK_GAME.stage !== l) SK_GAME.debug.stage(l); SK_GAME.debug.god(true); }, label);
    await until(p, () => SK_GAME.phase === 'play', null, 6000);
    if (tele) await ev(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  };
  // Đi đường thật tới thắng: dọn phòng trùm, bước vào cổng, qua bảng thiên phú (Digit0 = bỏ qua khi còn thuần túy, Digit1 khi không).
  const toPortal = async () => {
    await until(p, () => SK_GAME.rooms.some(r => r.type === 'boss' && r.state === 'locked'), null, 8000);
    await ev(() => SK_GAME.debug.clearRoom());
    await until(p, () => !!SK.G.portal, null, 8000);
    await ev(() => { const G = SK.G, pl = G.player; pl.x = G.portal.x; pl.y = G.portal.y; });
  };
  const keyThrough = async (cond, key) => {
    for (let i = 0; i < 60; i++) {
      if (await ev(() => !!SK.G.hold)) { await p.keyboard.press(key); await sleep(150); }
      if (await ev(cond)) return true;
      await sleep(150);
    }
    return false;
  };
  const watchEnd = () => ev(() => { window.__re = null; SK.on('runEnd', (G, r) => { window.__re = { won: r.won, pure: r.pure, mul: r.gemMul, stage: r.stage }; }); });

  // ---- 3a. thuần túy đạt: cổng 3-5 mở Tước Sĩ, thắng thật nhân đôi đá quý
  check('ván Thuần Túy mở được', await fresh(true, { pure: true }));
  const a0 = await ev(() => { const q = SK.G.pure; return { on: !!q && q.on, lim: q && q.limit, n: SK.STAGES.length, last: SK.STAGES[SK.STAGES.length - 1].label, live: SK.bossrush2.pureLive(SK.G) }; });
  check('Thuần Túy bật: hạn 12 phút, còn ải 3-6, đang hợp lệ', a0.on && a0.lim === 720 && a0.n === 16 && a0.last === '3-6' && a0.live, JSON.stringify(a0));
  await stageTo('1-1', true);
  await sleep(1200);
  const clk = await ev(() => SK.G.pure.t);
  check('đồng hồ chạy khi ở phòng trùm (ngoài phòng khởi đầu)', clk > 0.5, 'đã ' + clk.toFixed(2) + ' s');
  await p.screenshot({ path: path.join(SHOTS, 'pure-clock.png') });
  await ev(() => { SK.ROOMS.openChoice(); });
  const sk = await ev(() => { const open0 = SK.ROOMS.choice.open; return { open0 }; });
  await p.keyboard.press('Digit0');
  const sk2 = await ev(() => ({ open: SK.ROOMS.choice.open, hold: !!SK.G.hold, live: SK.bossrush2.pureLive(SK.G) }));
  check('bảng thiên phú: phím 0 bỏ qua, vẫn thuần túy', sk.open0 && !sk2.open && !sk2.hold && sk2.live, JSON.stringify(sk2));
  await ev(() => { SK.G.pure.t = 100; SK_GAME.debug.god(true); });
  await watchEnd();
  await stageTo('3-5', true);
  await ev(() => { SK.G.pure.t = 100; });
  const gem0 = await ev(() => SK.profile.gems);
  await toPortal();
  await keyThrough(() => SK_GAME.stage === '3-6', 'Digit0');
  const a1 = await ev(() => ({ stage: SK_GAME.stage, n: SK.STAGES.length, passed: SK.G.pure.passed, live: SK.bossrush2.pureLive(SK.G) }));
  check('qua cổng 3-5 kịp giờ, không thiên phú, không vũ khí lạ: vào trận Tước Sĩ 3-6', a1.stage === '3-6' && a1.n === 16 && a1.passed, JSON.stringify(a1));
  await until(p, () => SK_GAME.phase === 'play', null, 6000);
  await ev(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
  check('3-6: Tước Sĩ Đỏ xuất hiện', await until(p, () => SK.G.enemies.some(e => e.bossKey === 'boss_bossrush_final'), null, 8000));
  await until(p, () => SK.G.enemies.some(e => e.arena && e.arena.introT >= 3), null, 8000);
  // lính của Tước Sĩ: sinh qua nhịp thật (SUMMON_EVERY) và đủ loại
  await ev(() => { SK.bossrush2.SUMMON_EVERY = 1; });
  const mins = await until(p, () => SK.G.enemies.filter(e => /^e_bossrush_minion_/.test(e.id) && e.st !== 'dead').length >= 3, null, 12000);
  await p.screenshot({ path: path.join(SHOTS, 'final-minions.png') });
  const m1 = await ev(() => { const l = SK.G.enemies.filter(e => /^e_bossrush_minion_/.test(e.id)); return { n: l.length, ids: l.map(e => e.id.slice(-1)).join(''), hp: l.map(e => e.hpMax).join(','), room: l.every(e => e.room === SK.G.room) }; });
  check('Tước Sĩ gọi lính e_bossrush_minion_* đúng nhịp, cùng phòng, HP 300 (đợt đầu)', mins && m1.n >= 3 && m1.room && /^300(,300)*$/.test(m1.hp.split(',').slice(0, 3).join(',')), JSON.stringify(m1));
  await ev(() => { SK.bossrush2.SUMMON_EVERY = 1e9; });
  const m2 = await ev(() => { SK.G.enemies.filter(e => /^e_bossrush_minion_/.test(e.id)).forEach(e => { e.hp = 0; e.st = 'dead'; e.stT = 9; }); const w = SK.bossrush2.summon(SK.G, 2).map(e => e.hpMax); return { w2: w, wave: SK.G.brWave }; });
  check('đợt lính sau mạnh hơn 7% (HP 321)', m2.w2.length === 2 && m2.w2.every(h => h === 321) && m2.wave === 2, JSON.stringify(m2));
  await ev(() => { SK.G.enemies.filter(e => /^e_bossrush_minion_/.test(e.id)).forEach(e => { e.hp = 0; e.st = 'dead'; e.stT = 9; }); });
  await toPortal();
  const won1 = await keyThrough(() => SK_GAME.state === 'victory', 'Digit0');
  await sleep(300);
  const re1 = await ev(() => window.__re), gem1 = await ev(() => SK.profile.gems);
  check('thắng thật 3-6: runEnd won = true, pure = win, gemMul gấp đôi', won1 && re1 && re1.won === true && re1.pure === 'win' && re1.mul === 2, JSON.stringify(re1));
  const base = await ev(() => 0), got = gem1 - gem0;
  check('đá quý nhận được gấp đôi công thức (>= 2 x 260 cho 16 ải + thắng)', got >= 520, 'nhận ' + got + ' ' + base);

  // ---- 3b. trượt vì nhặt vũ khí lạ: không mở Tước Sĩ, giảm một nửa
  check('ván Thuần Túy thứ hai mở được', await fresh(true, { pure: true, seed: 32 }));
  await watchEnd();
  await ev(() => { SK_GAME.debug.give(Object.keys(SK.DS.weapons).find(id => SK.G.pure.start.indexOf(id) < 0 && SK.DS.weapons[id].sprite)); });
  const w0 = await ev(() => ({ live: SK.bossrush2.pureLive(SK.G), failed: SK.G.pure.failed }));
  check('nhặt vũ khí lạ: thuần túy tạm tắt (chưa tính hỏng)', w0.live === false && !w0.failed, JSON.stringify(w0));
  await stageTo('3-5', true);
  await ev(() => { SK.G.pure.t = 100; });
  await p.screenshot({ path: path.join(SHOTS, 'pure-weapon.png') });
  const gemB0 = await ev(() => SK.profile.gems);
  await toPortal();
  const wonB = await keyThrough(() => SK_GAME.state === 'victory', 'Digit1');
  await sleep(300);
  const reB = await ev(() => ({ re: window.__re, n: SK.STAGES.length, last: SK.STAGES[SK.STAGES.length - 1].label, failed: SK.G.pure.failed }));
  check('vũ khí lạ lúc qua 3-5: bỏ ải 3-6, thắng ở 3-5, thua điều kiện "weapon"', wonB && reB.n === 15 && reB.last === '3-5' && reB.failed === 'weapon' && reB.re && reB.re.stage === '3-5', JSON.stringify(reB));
  check('runEnd: pure = fail, gemMul 0,5', reB.re && reB.re.pure === 'fail' && reB.re.mul === 0.5, JSON.stringify(reB.re));
  const gotB = (await ev(() => SK.profile.gems)) - gemB0;
  check('đá quý bị giảm một nửa (khoảng 15 ải: 150 + 100 / 2 + quái)', gotB > 0 && gotB < 230, 'nhận ' + gotB);

  // ---- 3c. cất vũ khí lạ đi thì hợp lệ lại
  check('ván thứ ba mở được', await fresh(true, { pure: true, seed: 33 }));
  await ev(() => { SK_GAME.debug.give(Object.keys(SK.DS.weapons).find(id => SK.G.pure.start.indexOf(id) < 0 && SK.DS.weapons[id].sprite)); });
  const c0 = await ev(() => SK.bossrush2.pureLive(SK.G));
  await ev(() => { const p = SK.G.player; p.weapons[1] = null; p.cur = 0; });
  const c1 = await ev(() => SK.bossrush2.pureLive(SK.G));
  check('vứt vũ khí lạ thì thuần túy bật lại', c0 === false && c1 === true, JSON.stringify({ c0, c1 }));

  // ---- 3d. chọn thiên phú thật: hỏng, không mở Tước Sĩ
  check('ván thứ tư mở được', await fresh(true, { pure: true, seed: 34 }));
  await stageTo('1-1', true);
  await ev(() => { SK.ROOMS.openChoice(); SK.ROOMS.pick(0); });
  await sleep(200);
  const d0 = await ev(() => ({ failed: SK.G.pure.failed, live: SK.bossrush2.pureLive(SK.G), buffs: SK.G.player.buffs.length }));
  check('chọn thiên phú: Thuần Túy hỏng (talent)', d0.failed === 'talent' && !d0.live && d0.buffs === 1, JSON.stringify(d0));
  await stageTo('3-5', true);
  await toPortal();
  await keyThrough(() => SK_GAME.state === 'victory', 'Digit1');
  const d1 = await ev(() => ({ n: SK.STAGES.length, st: SK_GAME.state, last: SK_GAME.stage }));
  check('thiên phú rồi qua 3-5: không mở Tước Sĩ', d1.n === 15 && d1.st === 'victory' && d1.last === '3-5', JSON.stringify(d1));

  // ---- 3e. quá giờ: đồng hồ chạy tới hạn thì hỏng; không có Thuần Túy thì không đồng hồ
  check('ván thứ năm mở được', await fresh(true, { pure: true, seed: 35 }));
  await stageTo('1-1', true);
  await ev(() => { SK.G.pure.t = SK.G.pure.limit - 0.4; });
  await until(p, () => SK.G.pure.failed === 'time', null, 4000);
  const e0 = await ev(() => ({ failed: SK.G.pure.failed, toast: SK.G.toastMsg }));
  await p.screenshot({ path: path.join(SHOTS, 'pure-timeout.png') });
  check('quá giờ: Thuần Túy hỏng (time), có báo "thất bại"', e0.failed === 'time' && /thất bại/.test(e0.toast), JSON.stringify(e0));
  await stageTo('3-5', true);
  await toPortal();
  await keyThrough(() => SK_GAME.state === 'victory', 'Digit1');
  const e1 = await ev(() => ({ n: SK.STAGES.length, last: SK_GAME.stage }));
  check('quá giờ rồi qua 3-5: không mở Tước Sĩ', e1.n === 15 && e1.last === '3-5', JSON.stringify(e1));
  check('chơi thường (không Thuần Túy): không đồng hồ, không đổi đá quý', await fresh(false, { seed: 36 }) && await ev(() => SK.G.pure === null));
  await stageTo('3-5', true);
  await watchEnd();
  await toPortal();
  await keyThrough(() => SK_GAME.state === 'victory', 'Digit1');
  const f0 = await ev(() => ({ n: SK.STAGES.length, re: window.__re }));
  check('ván thường qua 3-5: không Tước Sĩ, gemMul không bị đổi', f0.n === 15 && f0.re && f0.re.pure === undefined && !(f0.re.mul === 2 || f0.re.mul === 0.5), JSON.stringify(f0));

  // ---- Lợi Hại: hạn 17 phút, Tước Sĩ Tím
  await ev(() => { localStorage.setItem('sk.profile.v1', JSON.stringify({ won: { knight: 1 }, gems: 0 })); });
  await p.reload();
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await ev(() => SK.profile.setBadass(true));
  check('ván Lợi Hại + Thuần Túy mở được', await fresh(true, { pure: true, seed: 37 }));
  const g0 = await ev(() => ({ lim: SK.G.pure.limit, bad: SK.G.badass }));
  check('Lợi Hại: hạn 17 phút', g0.bad && g0.lim === 1020, JSON.stringify(g0));
  await ev(() => SK.profile.setBadass(false));

  // ---- 1. lính: định nghĩa và vũ khí
  const md = await ev(() => SK.bossrush2.minionIds().map(id => { const d = SK.D.enemies[id]; return id.slice(-1) + ':' + d.ai[0].cls + ':' + d.weapons[0].cls + ':' + d.hp + ':' + d.speed; }).join(' '));
  check('4 lính có định nghĩa (a kiếm EnemyAI02, b cung EnemyAI03, c súng EnemyAI01, d súng ngắn EnemyAI02), HP 300 tốc 5',
    md === 'a:EnemyAI02:ESword01:300:5 b:EnemyAI03:EGun004:300:5 c:EnemyAI01:EGun002:300:5 d:EnemyAI02:EGun001:300:5', md);
  check('ván lính mở được', await fresh(false, { seed: 38 }));
  await stageTo('3-6', true);
  await until(p, () => SK.G.enemies.some(e => e.bossKey === 'boss_bossrush_final'), null, 8000);
  await ev(() => { SK_GAME.debug.god(true); SK.bossrush2.SUMMON_EVERY = 1e9; for (const k of 'abcd') { const e = SK.makeEnemy(SK.G, 'e_bossrush_minion_' + k, SK.G.player.x + (k.charCodeAt(0) - 98.5) * 26, SK.G.player.y - 40, SK.G.room); SK.G.enemies.push(e); } });
  await until(p, () => !SK.bossHud.intro, null, 8000);
  await sleep(1500);
  const sp = await ev(() => SK.G.enemies.filter(e => /^e_bossrush_minion_/.test(e.id)).map(e => e.id.slice(-1) + ':' + e.st + ':' + e.hp).join(' '));
  await p.screenshot({ path: path.join(SHOTS, 'minions-four.png') });
  check('cả 4 loại lính sinh và hoạt động (không kẹt trạng thái sinh)', /a:/.test(sp) && /b:/.test(sp) && /c:/.test(sp) && /d:/.test(sp) && !/:spawn:/.test(sp), sp);

  // ---- 4. trùm tầng 4 trong bể
  check('ván tầng 4 trong bể mở được', await fresh(false, { seed: 39, f4: 1 }));
  const f4 = await ev(() => SK.STAGES.filter(s => s.f4pool).map(s => s.label + '@' + s.theme).join(' '));
  check('f4Rate = 1: các ải 3-2..3-5 đổi sang vùng tầng 4', /3-2@/.test(f4) && /3-5@/.test(f4) && !/3-1@/.test(f4) && /monolith|battleground/.test(f4), f4);
  await stageTo('3-2', true);
  const f4b = await until(p, () => SK.G.enemies.some(e => e.bossKey && e.room === SK.G.room), null, 8000);
  const f4id = await ev(() => { const e = SK.G.enemies.find(x => x.bossKey && x.room === SK.G.room); return e ? e.bossKey : null; });
  await sleep(2500);
  await p.screenshot({ path: path.join(SHOTS, 'floor4-boss.png') });
  check('ải 3-2 vùng tầng 4: trùm là trùm tầng 4 (stone_man / warlord / stone_dragon)', f4b && /^boss_(stone_man|warlord|stone_dragon)$/.test(f4id), String(f4id));
  await ev(() => { SK.bossrush2.f4Rate = 0; });

  check('không lỗi trang', !errs.length, errs.slice(0, 4).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail + '   Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
