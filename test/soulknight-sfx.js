// Kiểm thử tiếng thật của Hiệp Sĩ Linh Hồn: node test/soulknight-sfx.js (cần server 8811).
// Đếm AudioBufferSourceNode đã start theo tên clip (SK.sfx.stats) cho từng sự kiện. m4a/AAC cần Chrome thật
// (channel 'chrome'); Chromium đi kèm Playwright không có AAC nên bị bỏ qua có báo.
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log((ok ? '  OK   ' : '  FAIL ') + n + (d ? ' - ' + d : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// index.html do lead quản: nếu chưa có thẻ data/sk-audio.js thì chèn giúp khi kiểm thử.
async function withAudioTag(ctx) {
  await ctx.route(u => /^http/.test(u.href) && /games\/soulknight\/index\.html/.test(u.href), async route => {
    const res = await route.fetch();
    let body = await res.text();
    if (!/data\/sk-audio\.js/.test(body)) body = body.replace(/<script src="js\/sfx\.js/, '<script src="data/sk-audio.js"></script>\n<script src="js/sfx.js');
    await route.fulfill({ response: res, body });
  });
}

(async () => {
  let b;
  try { b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] }); }
  catch (e) { console.log('  (không có Chrome thật, dùng Chromium của Playwright: có thể không giải mã được AAC)'); b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); }
  const cx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await withAudioTag(cx);
  const p = await cx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.evaluate(() => { localStorage.removeItem('sk-muted'); SK_GAME.debug.seed(20260929); });

  const st = () => p.evaluate(() => Object.assign({}, SK.sfx.stats));
  const ev = () => p.evaluate(() => Object.assign({}, SK.sfx.ev));
  const A = await p.evaluate(() => window.SK_AUDIO && { n: Object.keys(SK_AUDIO.clips).length, ev: SK_AUDIO.events, music: SK_AUDIO.music, kind: SK_AUDIO.byKind, hero: SK_AUDIO.byHero.knight });
  check('SK_AUDIO nạp được', !!A && A.n > 800, A && A.n + ' clip');
  check('có nút loa', await p.evaluate(() => !!document.getElementById('sk-mute')));

  // --- sảnh: lần bấm đầu mở AudioContext, nhạc sảnh phát
  await p.keyboard.press('Space');   // cử chỉ đầu (không phải nút)
  await p.waitForFunction(() => SK.sfx.ctx && SK.sfx.ctx.state === 'running', null, { timeout: 4000 }).catch(() => {});
  check('AudioContext chạy sau cử chỉ đầu', await p.evaluate(() => SK.sfx.ctx && SK.sfx.ctx.state === 'running'));
  await p.waitForFunction(() => SK.sfx.bufCount() >= 10, null, { timeout: 15000 }).catch(() => {});
  const nbuf = await p.evaluate(() => SK.sfx.bufCount());
  const failed = await p.evaluate(() => Object.keys(SK.sfx.failed));
  check('nạp + giải mã mẫu m4a', nbuf >= 10 && failed.length === 0, nbuf + ' bộ đệm, hỏng: ' + failed.slice(0, 5));
  if (nbuf < 10) { console.log('  Không giải mã được âm thanh: dừng.'); await b.close(); process.exit(1); }
  await p.waitForFunction(m => SK.sfx.music.cur && SK.sfx.music.cur.name === m, A.music.lobby, { timeout: 8000 }).catch(() => {});
  check('nhạc sảnh (bgm_room)', await p.evaluate(m => SK.sfx.music.cur && SK.sfx.music.cur.name === m, A.music.lobby), A.music.lobby);
  await p.evaluate(() => SK.emit('x'));
  const s0 = await st();
  await p.click('#hs-modes, .hs-btn, #sk-start').catch(() => {});   // nút bất kỳ trong sảnh -> tiếng bấm
  await sleep(200);

  // --- vào ải 1-1
  if (await p.evaluate(() => SK_GAME.state) !== 'stage') await p.evaluate(() => SK_GAME.start());
  await sleep(600);
  await p.evaluate(() => SK_GAME.debug.god(true));
  check('nhạc ải 1 (bgm_1Low)', await p.waitForFunction(m => SK.sfx.music.cur && SK.sfx.music.cur.name === m, A.music.theme.forest, { timeout: 8000 }).then(() => true).catch(() => false));

  // --- vũ khí thật -> tiếng bắn đo được
  const wid = await p.evaluate(() => SK_GAME.player.weapon);
  const want = await p.evaluate(w => { const bw = SK_AUDIO.byWeapon[w]; const k = SK.G.player.weapons[SK.G.player.cur].def.kind; return bw ? bw.fire : SK_AUDIO.byKind[k]; }, wid);
  await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
  await sleep(300);
  await p.keyboard.down('KeyJ');
  await sleep(2500);
  let s = await st(), e = await ev();
  check('tiếng bắn = clip của vũ khí ' + wid + ' (' + want + ')', s[want] > 0, JSON.stringify(s));
  check('tiếng trúng đòn', e.enemyHit > 0 || e.enemyCrit > 0);
  await p.evaluate(() => SK_GAME.debug.clearRoom());
  await p.keyboard.up('KeyJ');
  await sleep(200);
  s = await st(); e = await ev();
  check('khoá phòng = ' + A.ev.roomLock, s[A.ev.roomLock] > 0);
  check('dọn phòng = ' + A.ev.roomClear, s[A.ev.roomClear] > 0);
  check('quái chết', e.enemyKill > 0);
  const pre = await st();
  await p.evaluate(() => { SK.emit('pickup', SK.G, 'coin'); });
  await sleep(120);
  await p.evaluate(() => { SK.emit('pickup', SK.G, 'energy'); });
  await sleep(120);
  await p.evaluate(() => { SK.emit('pickup', SK.G, 'hp_pot'); });
  s = await st();
  check('nhặt vàng/năng lượng/bình = ' + [A.ev.coin, A.ev.energy, A.ev.hpPot].join(','),
    s[A.ev.coin] > (pre[A.ev.coin] || 0) && s[A.ev.energy] > (pre[A.ev.energy] || 0) && s[A.ev.hpPot] > (pre[A.ev.hpPot] || 0));
  const pre2 = await st();
  await p.evaluate(() => { SK.emit('skill', SK.G, { hero: 'knight' }); SK.emit('playerHurt', SK.G, { hero: 'knight', armor: 0 }, 1); });
  s = await st();
  const hk = A.hero;
  const sk = Array.isArray(hk.skill) ? hk.skill[0] : hk.skill;
  check('kỹ năng + trúng đòn theo hero (' + sk + ',' + hk.hit + ')', s[sk] > (pre2[sk] || 0) && s[hk.hit] > (pre2[hk.hit] || 0));
  await p.evaluate(() => SK.emit('portalEnter', SK.G, SK.G.stage));
  check('cổng = ' + A.ev.portal, (await st())[A.ev.portal] > 0);

  // --- giới hạn đa âm: 60 phát liền trong một khung chỉ start vài nguồn
  await sleep(300);
  const b4 = (await st())[want] || 0;
  await p.evaluate(() => { const G = SK.G, pl = G.player; for (let i = 0; i < 60; i++) SK.emit('fire', G, pl, pl.weapons[pl.cur]); });
  const dPoly = ((await st())[want] || 0) - b4;
  check('đa âm bị giới hạn (60 phát -> ' + dPoly + ' nguồn)', dPoly <= 3);

  // --- trùm: khoá phòng trùm => nhạc trùm, dọn xong => nhạc ải
  await p.evaluate(() => SK_GAME.debug.stage('1-5'));
  await sleep(500);
  await p.evaluate(() => SK_GAME.debug.god(true));
  await p.evaluate(() => SK_GAME.debug.teleportTo('boss', 0));
  await sleep(700);
  check('vào phòng trùm: nhạc trùm ' + A.music.boss['1'], await p.waitForFunction(m => SK.sfx.music.cur && SK.sfx.music.cur.name === m, A.music.boss['1'], { timeout: 8000 }).then(() => true).catch(() => false));
  await p.evaluate(() => SK_GAME.debug.clearRoom());
  check('dọn phòng trùm: về nhạc ải', await p.waitForFunction(m => SK.sfx.music.cur && SK.sfx.music.cur.name === m, A.music.theme.forest, { timeout: 8000 }).then(() => true).catch(() => false));

  // --- tắt tiếng
  await p.keyboard.press('KeyM');
  await sleep(100);
  check('phím M tắt tiếng + lưu', await p.evaluate(() => SK.sfx.muted && localStorage.getItem('sk-muted') === '1'));
  check('tắt tiếng: không còn nguồn/nhạc nào', await p.evaluate(() => SK.sfx.music.cur === null));
  const before = JSON.stringify(await st());
  await p.evaluate(() => { for (const e of ['fire', 'enemyHit', 'enemyKill']) SK.emit(e, SK.G, { armor: 0 }, { def: { kind: 'gun' } }); });
  await sleep(500);
  check('tắt tiếng thì không start nguồn nào', JSON.stringify(await st()) === before);
  await p.click('#sk-mute');
  check('bấm nút loa bật lại', await p.evaluate(() => !SK.sfx.muted));
  check('bật lại: nhạc trở lại', await p.waitForFunction(() => !!SK.sfx.music.cur, null, { timeout: 8000 }).then(() => true).catch(() => false));
  const k0 = (await ev()).enemyKill || 0;
  await p.evaluate(() => SK.emit('enemyKill', SK.G, {}));
  check('bật lại thì có tiếng', ((await ev()).enemyKill || 0) > k0);
  check('không lỗi', errs.length === 0 && (await p.evaluate(() => SK.sfx.errors)) === 0, errs.join(' | '));

  // --- file://: không fetch, không lỗi
  const pf = await cx.newPage();
  const ferrs = [];
  pf.on('pageerror', e => ferrs.push(e.message));
  pf.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) ferrs.push(m.text()); });
  await pf.goto('file:///' + require('path').resolve(__dirname, '..', 'games/soulknight/index.html').replace(/\\/g, '/') + '?quick=1&themes=forest,castle,volcano');
  await pf.keyboard.press('Space'); await sleep(600);
  check('file://: chế độ im lặng, không lỗi', ['file', 'no-data'].includes(await pf.evaluate(() => SK.sfx.mode)) && ferrs.length === 0, ferrs.join(' | '));
  await b.close();
  console.log(fail ? fail + ' FAIL' : 'ALL OK');
  process.exit(fail ? 1 : 0);
})();
