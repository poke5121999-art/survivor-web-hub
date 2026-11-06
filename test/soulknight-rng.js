/*
 * Đợt quái của mỗi phòng không trôi khi nội dung phòng khác đổi (Hiệp Sĩ Linh Hồn, js/game.js G.roomSeed + js/world.js lockRoom).
 * Cùng seed, ép phòng đặc biệt là tượng / lính thuê / lồng nhốt (mỗi loại tiêu số ngẫu nhiên khác nhau) → đợt quái phòng đánh đầu tiên phải trùng.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-rng.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); } return false; }

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
    const waves = async kind => {
      await p.evaluate(k => { SK_ROOMS.force.special = k; SK_GAME.debug.seed(20260929); SK.startRun('knight'); SK_GAME.debug.god(true); }, kind);
      await until(p, () => SK_GAME.state === 'stage', null, 5000);
      await p.evaluate(() => SK_GAME.debug.teleportTo('battle'));
      await until(p, () => { const r = SK.G.map.rooms.find(x => x.type === 'battle'); return r.state === 'locked' && r.waves && r.waves.length; }, null, 5000);
      return p.evaluate(() => {
        const G = SK.G, sp = G.map.rooms.find(r => r.type === 'special'), r = G.map.rooms.find(x => x.type === 'battle');
        return { special: sp && sp.fill, room: r.id, n: (r.waves || []).flat().length, waves: JSON.stringify(r.waves) };
      });
    };
    const a = await waves('statue'), m = await waves('merc'), c = await waves('cage');
    await p.evaluate(() => { SK_ROOMS.force.special = null; });
    check('ép được ba loại phòng đặc biệt khác nhau', a.special !== m.special && m.special === 'merc' && c.special === 'cage', [a.special, m.special, c.special].join(' / '));
    check('đợt quái phòng đánh đầu tiên trùng nhau dù phòng đặc biệt là tượng, lính thuê hay lồng nhốt', a.n > 0 && a.waves === m.waves && a.waves === c.waves, 'phòng ' + a.room + ', ' + a.n + ' quái' + ': ' + a.waves.slice(0, 80));
  } catch (e) { check('chạy trọn', false, e.message.split('\n')[0]); }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
