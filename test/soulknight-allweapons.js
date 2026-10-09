/*
 * Quét mọi vũ khí của Hiệp Sĩ Linh Hồn (games/soulknight): 409 đánh số + 28 thần thoại + vũ khí khởi đầu.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-allweapons.js
 *
 * Mỗi món: trao vào tay ở phòng xuất phát 1-1 (bật god), giữ J 0,7 s rồi nhả (cung / tụ lực bắn lúc nhả),
 * phải phát sự kiện 'fire' ít nhất một lần. Không được có lỗi trang.
 * WEAPONS=weapon_001,weapon_mythic_00 chỉ quét vài món.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const ONLY = process.env.WEAPONS ? process.env.WEAPONS.split(',') : null;
// Không phát 'fire' ở phòng trống theo đúng bản gốc [ĐO actors.js CUSTOM_FIRE]: Sổ Tay Chết Chóc chỉ "viết tên" quái đang
// được ngắm; Cào Trúng Thưởng là thẻ cào (CUSTOM_HOLD), không có đạn.
const NO_FIRE = { weapon_276: 'GunDeadNote cần mục tiêu', weapon_332: 'GunLottery thẻ cào' };

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  if (!ok || detail) results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
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
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => SK_GAME.debug.seed(11));
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 6000);
  const ids = await p.evaluate(only => {
    SK_GAME.debug.god(true); SK_GAME.debug.pet(false);
    window.__fire = 0;
    SK.on('fire', () => { window.__fire++; });
    const all = Object.keys(SK_DESIGN.weapons).filter(k => SK_DESIGN.weapons[k].prefab);
    return only ? all.filter(k => only.indexOf(SK_DESIGN.weapons[k].prefab) >= 0 || only.indexOf(k) >= 0) : all;
  }, ONLY);
  check('số vũ khí có prefab 8.6', ids.length >= (ONLY ? 1 : 437), ids.length + ' món');
  const dead = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    await p.evaluate(wid => {
      SK_GAME.debug.give(wid);
      const pl = SK.G.player; pl.energy = pl.energyMax = 999; pl.st = 'alive';
      window.__fire = 0;
    }, id);
    await p.keyboard.down('KeyJ');
    await sleep(700);
    await p.keyboard.up('KeyJ');
    await sleep(250);
    const fired = await p.evaluate(() => window.__fire);
    if (!fired && !NO_FIRE[id]) dead.push(id);
    if (i % 50 === 49) console.log('  ' + (i + 1) + '/' + ids.length + ', câm ' + dead.length);
  }
  check('mọi vũ khí bắn/chém được (phát sự kiện fire)', dead.length === 0, dead.length + ' câm: ' + dead.slice(0, 40).join(' '));
  check('không lỗi trang', errs.length === 0, [...new Set(errs)].slice(0, 5).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
