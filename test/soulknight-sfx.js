// Kiểm thử tiếng của Hiệp Sĩ Linh Hồn: node test/soulknight-sfx.js (cần server 8811).
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
let fail = 0;
const check = (n, ok, d) => { if (!ok) fail++; console.log((ok ? '  OK   ' : '  FAIL ') + n + (d ? ' - ' + d : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.evaluate(() => { localStorage.removeItem('sk-muted'); SK_GAME.debug.seed(20260929); });
  await p.click('#sk-start');
  await sleep(400);
  await p.evaluate(() => SK_GAME.debug.god(true));
  const st = () => p.evaluate(() => Object.assign({}, SK.sfx.stats));
  check('có nút loa', await p.evaluate(() => !!document.getElementById('sk-mute')));
  check('AudioContext chạy sau lần bấm đầu', await p.evaluate(() => SK.sfx.ctx && SK.sfx.ctx.state === 'running'));

  await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
  await sleep(300);
  await p.keyboard.down('KeyJ');
  await sleep(2500);
  let s = await st();
  check('tiếng bắn', s.fire > 0, JSON.stringify(s));
  check('tiếng trúng đòn', s.hit > 0);
  await p.evaluate(() => SK_GAME.debug.clearRoom());
  await p.keyboard.up('KeyJ');
  await sleep(200);
  s = await st();
  check('tiếng khoá phòng', s.lock > 0);
  check('tiếng dọn phòng', s.clear > 0);
  check('tiếng quái chết', s.kill > 0);
  await p.evaluate(() => { SK.emit('pickup', SK.G, 'coin'); SK.emit('pickup', SK.G, 'energy'); SK.emit('pickup', SK.G, 'hp_pot'); });
  s = await st();
  check('tiếng nhặt vàng/năng lượng/bình', s.coin > 0 && s.energy > 0 && s.pot > 0);
  await p.evaluate(() => SK.emit('runEnd', SK.G, { won: true }));
  check('nhạc kết thúc', (await st()).end > 0);

  await p.keyboard.press('KeyM');
  check('phím M tắt tiếng + lưu', await p.evaluate(() => SK.sfx.muted && localStorage.getItem('sk-muted') === '1'));
  const before = JSON.stringify(await st());
  await p.evaluate(() => { for (const e of ['fire', 'enemyHit', 'enemyKill']) SK.emit(e, SK.G, { armor: 0 }, { def: { kind: 'gun' } }); });
  await sleep(300);
  check('tắt tiếng thì không lên lịch tiếng nào', JSON.stringify(await st()) === before);
  await p.click('#sk-mute');
  check('bấm nút loa bật lại', await p.evaluate(() => !SK.sfx.muted));
  const k0 = (await st()).kill;
  await p.evaluate(() => SK.emit('enemyKill', SK.G, {}));
  check('bật lại thì có tiếng', (await st()).kill > k0);
  check('không lỗi', errs.length === 0 && (await p.evaluate(() => SK.sfx.errors)) === 0, errs.join(' | '));
  await b.close();
  console.log(fail ? fail + ' FAIL' : 'ALL OK');
  process.exit(fail ? 1 : 0);
})();
