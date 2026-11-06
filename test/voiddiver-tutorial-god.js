/*
 * VOID DIVER — tutorial 1100 phải bất tử suốt chuyến (yêu cầu chủ dự án, 2026-09-28): độ khó hạ xuống Easy
 * (bảng Difficulty, hàng thấp nhất) và người chơi gắn buff Invincibility (Buff 1000001, BlockDamage +
 * BlockStressDamage, Duration -1) ngay lúc spawn trong js/dive.js D.start. Bài này không đi bộ hết tutorial
 * (đã có test/voiddiver-tutorial-walk.js lo phần đó) — chỉ vào chuyến, đứng yên giữa quái vây quanh ~20 s
 * game-time, rồi đứng lên một cái bẫy, và kiểm máu không giảm, không chết, chuyến không kết thúc bằng 'dead'.
 *
 * Chạy:  node test/voiddiver-tutorial-god.js [--seed=7]
 *   Hỏng nếu: pageerror, console error, response ≥ 400, máu tụt, người chơi chết, hoặc quái/bẫy không thật sự
 *   đánh trúng (nghĩa là bài kiểm không kiểm được gì). Ảnh ở %TEMP%/voiddiver-tutorial-god-shots/.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'voiddiver-tutorial-god-shots');
const OPT = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v == null ? true : v]; }));
const SEED = +(OPT.seed || 7);
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
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name) { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); console.log('    ảnh: ' + f); }
async function gameWait(page, sec) {
  const t0 = await page.evaluate(() => VD.loop.time);
  await page.waitForFunction(([t0, s]) => VD.loop.time - t0 >= s, [t0, sec], { timeout: Math.max(30000, sec * 15000), polling: 50 });
}

async function run(browser, port, errors) {
  console.log(`\n== Tutorial 1100 bất tử: đứng cạnh quái + qua bẫy (seed ${SEED})`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(`${process.env.VD_BASE || ("http://127.0.0.1:" + port)}/games/voiddiver/index.html?campaign=1100&seed=${SEED}&char=100001`);
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  await page.waitForFunction(() => VD.dive.state === 'play', null, { timeout: 60000 });   // thẻ tên tự qua sau 2 s

  // Bỏ qua hội thoại mở màn (giữ Ctrl) để có toàn quyền điều khiển thời gian game.
  await page.waitForFunction(() => VD.dialog && VD.dialog.open, null, { timeout: 60000 }).catch(() => {});
  if (await page.evaluate(() => !!(VD.dialog && VD.dialog.open))) {
    await page.keyboard.down('Control');
    await page.waitForFunction(() => !VD.dialog.open, null, { timeout: 60000 }).catch(() => {});
    await page.keyboard.up('Control');
  }
  await sleep(300);

  // ---- chốt: chuyến này là tutorial, độ khó Easy, người chơi mang buff bất tử của bảng Buff (1000001).
  const flags = await page.evaluate(() => ({
    isTutorial: VD.dive.isTutorial, diff: VD.dive.diffName, inv: VD.stage.player.buffs.invincible(),
  }));
  check('VD.dive.isTutorial === true', flags.isTutorial === true, JSON.stringify(flags.isTutorial));
  check('độ khó chuyến = Easy (thấp nhất bảng Difficulty)', flags.diff === 'Easy', flags.diff);
  check('người chơi có buff Invincibility chặn sát thương + căng thẳng', !!(flags.inv && flags.inv.BlockDamage && flags.inv.BlockStressDamage), JSON.stringify(flags.inv));

  const hp0 = await page.evaluate(() => ({ hp: VD.stage.player.hp, max: VD.stage.player.stats.HpMax }));
  check('máu đầy lúc vào chuyến', hp0.hp === hp0.max, JSON.stringify(hp0));
  console.log(`    HP trước: ${hp0.hp}/${hp0.max}`);

  // Đếm sự kiện 'damage' nhắm người chơi (kể cả bị chặn) mà không đụng vào luồng xử lý gốc của dive.js.
  await page.evaluate(() => {
    window.__hits = { seen: 0, blocked: 0 };
    const orig = VD.stage.onUnitEvent;
    VD.stage.onUnitEvent = function (e) {
      if (e.type === 'damage' && e.tgt === VD.stage.player) { window.__hits.seen++; if (e.blocked === 'invincible') window.__hits.blocked++; }
      return orig(e);
    };
  });

  // ---- vây quanh người chơi bằng quái 220009 (Atk 65, SightRange 30, 360°: thấy và lao vào ngay không cần né LOS).
  await page.evaluate(() => {
    const u = VD.stage.player;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) VD.stage.spawn({ kind: 'mon', id: 220009, pos: { x: u.pos.x + dx, z: u.pos.z + dz }, aim: { x: -dx || 1, z: -dz || 1 } });
  });
  await sleep(400);
  await shot(page, 'god-01-surrounded');

  // Đứng yên (không đánh trả) ~20 s thời gian game — quái phải đánh được nhiều lần trong lúc đó.
  await gameWait(page, 20);
  await shot(page, 'god-02-after-20s');

  const afterMons = await page.evaluate(() => ({
    hp: VD.stage.player.hp, max: VD.stage.player.stats.HpMax, dead: VD.stage.player.dead,
    state: VD.dive.state, hits: window.__hits,
  }));
  console.log(`    sau 20 s cạnh quái: HP ${afterMons.hp}/${afterMons.max}, trúng ${afterMons.hits.seen} nhát (${afterMons.hits.blocked} bị chặn), state=${afterMons.state}`);
  check('quái thật sự đánh trúng người chơi (không phải bài kiểm không chạm gì)', afterMons.hits.seen > 0, afterMons.hits.seen);
  check('mọi nhát trúng đều bị chặn (blocked=invincible)', afterMons.hits.seen > 0 && afterMons.hits.blocked === afterMons.hits.seen, JSON.stringify(afterMons.hits));
  check('máu vẫn đầy sau 20 s đứng giữa quái', afterMons.hp === afterMons.max, `${afterMons.hp}/${afterMons.max}`);
  check('người chơi không chết, chuyến vẫn đang chơi', !afterMons.dead && afterMons.state === 'play', afterMons.state);

  // ---- qua bẫy: chọn bẫy đầu tiên còn trên bản đồ, đứng lên đúng vị trí của nó cho nổ.
  const trapInfo = await page.evaluate(() => {
    const ents = VD.dive.ents.filter(e => e.kind === 'trap' && !e.removed);
    const step = ents.find(e => e.trigger && e.armed);
    const cool = ents.find(e => !e.trigger && e.row.CoolTime > 0);
    const e = step || cool;
    return e ? { x: e.pos.x, z: e.pos.z, step: !!step, cool: e.row.CoolTime || 0 } : null;
  });
  if (!trapInfo) {
    check('có bẫy trên bản đồ để kiểm', false, 'không tìm thấy bẫy nào trong VD.dive.ents (đã đi hết?)');
  } else {
    const hitsBefore = afterMons.hits.seen;
    await page.evaluate(([x, z]) => { const u = VD.stage.player; u.pos.x = x; u.pos.z = z; }, [trapInfo.x, trapInfo.z]);
    await sleep(200);
    await gameWait(page, trapInfo.step ? 1.5 : trapInfo.cool + 1.5);
    await shot(page, 'god-03-trap');
    const afterTrap = await page.evaluate(() => ({ hp: VD.stage.player.hp, max: VD.stage.player.stats.HpMax, dead: VD.stage.player.dead, state: VD.dive.state, hits: window.__hits }));
    console.log(`    qua bẫy (${trapInfo.step ? 'DestroyAfterAction' : 'CoolTime ' + trapInfo.cool + 's'}): HP ${afterTrap.hp}/${afterTrap.max}, trúng thêm ${afterTrap.hits.seen - hitsBefore} nhát`);
    check('bẫy có thật sự đánh trúng người chơi', afterTrap.hits.seen > hitsBefore, afterTrap.hits.seen - hitsBefore);
    check('qua bẫy: máu vẫn đầy', afterTrap.hp === afterTrap.max, `${afterTrap.hp}/${afterTrap.max}`);
    check('qua bẫy: người chơi không chết, chuyến vẫn đang chơi', !afterTrap.dead && afterTrap.state === 'play', afterTrap.state);
  }

  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try { await run(browser, srv.address().port, errors); } catch (e) { check('chạy hết không văng', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  const other = errors.filter(e => /^HTTP 404 .*\/(audio|art\/ui\/(portrait|dialogimage))\//.test(e) || /^console: Failed to load resource: the server responded with a status of 404/.test(e));
  const mine = errors.filter(e => other.indexOf(e) < 0);
  if (other.length) console.log('  WARN lỗi tải do module khác (' + other.length + '): ' + [...new Set(other.filter(e => /HTTP/.test(e)))].slice(0, 4).join(' | '));
  check('không pageerror / console error / HTTP ≥ 400', mine.length === 0, mine.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log(`\n${pass} pass, ${fail} fail` + (fails.length ? '\n  hỏng: ' + fails.join('; ') : ''));
  console.log('ảnh: ' + OUT);
  process.exit(fail ? 1 : 0);
})();
