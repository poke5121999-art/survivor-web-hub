/*
 * Kiểm thử khói cho Hiệp Sĩ Linh Hồn (games/soulknight).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-smoke.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-smoke/.
 *
 * Đi đúng vòng chơi bằng PHÍM THẬT: bấm nút vào hầm, giữ phím đi sang phòng đánh đầu,
 * phòng phải khoá + có quái; giữ J bắn cho tới khi máu quái giảm thật; rồi mới dùng móc debug
 * để dọn phòng (cửa phải mở lại), đi qua 3 phòng (chụp bản đồ nhỏ), bước vào cổng → 1-2.
 * Bật "god" để lượt đo không phụ thuộc cân bằng độ khó: vẫn trúng đòn, chỉ không chết.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const FILE_URL = 'file:///' + path.resolve(__dirname, '..', 'games', 'soulknight', 'index.html').split(path.sep).join('/');
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-smoke');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
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
const KEY = { '1,0': 'KeyD', '-1,0': 'KeyA', '0,1': 'KeyS', '0,-1': 'KeyW' };

function watch(p, errs, ignoreFonts) {
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => {
    if (r.status() >= 400 && !(ignoreFonts && /fonts\.(googleapis|gstatic)/.test(r.url()))) errs.push('http ' + r.status() + ' ' + r.url());
  });
}

async function mainRun(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs, false);
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });

  const font = await p.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('16px VT323', 'Năng lượng');
    return { ok: document.fonts.check('16px VT323', 'Năng lượng'), line: document.getElementById('sk-hero-line').textContent };
  });
  check('phông VT323 có chữ "Năng lượng"', font.ok && /Năng lượng/.test(font.line), font.line);

  await p.evaluate(() => SK_GAME.debug.seed(20260929));
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  const s0 = await p.evaluate(() => ({ state: SK_GAME.state, stage: SK_GAME.stage, rooms: SK_GAME.rooms }));
  check('bấm "Vào hầm ngục" → vào màn 1-1', s0.state === 'stage' && s0.stage === '1-1', s0.state + ' ' + s0.stage);
  await p.evaluate(() => SK_GAME.debug.god(true));

  // ---- đi bộ sang phòng đánh đầu tiên
  const start = s0.rooms[0], first = s0.rooms.find(r => r.type === 'battle' && start.links.includes(r.id)) ||
    s0.rooms.find(r => r.type === 'battle');
  const dir = [Math.sign(first.gx - start.gx), Math.sign(first.gy - start.gy)];
  const key = KEY[dir.join(',')];
  check('phòng đánh đầu nằm cạnh phòng xuất phát', !!key && Math.abs(first.gx - start.gx) + Math.abs(first.gy - start.gy) === 1, 'hướng ' + key);
  await sleep(300);
  await p.keyboard.down(key);
  const locked = await until(p, id => SK_GAME.rooms[id].state === 'locked', first.id, 12000);
  await p.keyboard.up(key);
  const lockInfo = await p.evaluate(id => ({ st: SK_GAME.rooms[id].state, door: SK_GAME.doorBlocked(id), pl: SK_GAME.player }), first.id);
  check('đi bộ vào phòng đánh → phòng khoá', locked, 'trạng thái ' + lockInfo.st + ' · người chơi ' + Math.round(lockInfo.pl.x) + ',' + Math.round(lockInfo.pl.y));
  check('cửa chặn lối khi phòng khoá', lockInfo.door === true);
  const spawned = await until(p, () => SK_GAME.enemyCount > 0, null, 3000);
  check('quái xuất hiện', spawned, 'số quái ' + (await p.evaluate(() => SK_GAME.enemyCount)));

  // ---- bắn thật
  await sleep(900);
  const hp0 = await p.evaluate(() => SK_GAME.enemyHp);
  const en0 = await p.evaluate(() => SK_GAME.enemyCount);
  await p.keyboard.down('KeyJ');
  await sleep(1800);
  await p.screenshot({ path: path.join(SHOTS, 'fight.png') });
  const shot = await until(p, a => SK_GAME.kills >= 1 || SK_GAME.enemyHp < a, hp0, 20000);
  // bắn thêm một lúc để thấy số quái giảm hẳn
  await until(p, a => SK_GAME.enemyCount < a || SK_GAME.rooms[SK_GAME.room].wave > 0, en0, 15000);
  await p.keyboard.up('KeyJ');
  const after = await p.evaluate(() => ({ hp: SK_GAME.enemyHp, n: SK_GAME.enemyCount, kills: SK_GAME.kills, pl: SK_GAME.player }));
  check('giữ J bắn làm máu quái giảm thật', shot, 'máu quái ' + hp0 + ' → ' + after.hp + ' · hạ ' + after.kills);
  check('năng lượng/giáp/máu hợp lệ trong trận', after.pl.hp >= 1 && after.pl.hp <= after.pl.hpMax && after.pl.energy <= after.pl.energyMax,
    'máu ' + after.pl.hp + '/' + after.pl.hpMax + ' giáp ' + after.pl.armor + '/' + after.pl.armorMax + ' nl ' + after.pl.energy);

  // ---- dọn phòng → cửa mở
  await p.evaluate(() => SK_GAME.debug.clearRoom());
  await sleep(400);
  const cleared = await p.evaluate(id => ({ st: SK_GAME.rooms[id].state, door: SK_GAME.doorBlocked(id), n: SK_GAME.enemyCount }), first.id);
  check('dọn xong → phòng "cleared", cửa mở lại', cleared.st === 'cleared' && cleared.door === false, JSON.stringify(cleared));
  await p.screenshot({ path: path.join(SHOTS, 'hud.png'), clip: { x: 0, y: 0, width: 330, height: 140 } });

  // ---- thêm 2 phòng nữa rồi chụp bản đồ nhỏ
  const battles = s0.rooms.filter(r => r.type === 'battle' && r.id !== first.id);
  for (const r of battles.slice(0, 2)) {
    await p.evaluate(id => SK_GAME.debug.teleportTo('battle', SK_GAME.rooms.filter(x => x.type === 'battle').findIndex(x => x.id === id)), r.id);
    await until(p, id => SK_GAME.rooms[id].state === 'locked', r.id, 3000);
    await sleep(600);
    await p.evaluate(() => SK_GAME.debug.clearRoom());
    await sleep(200);
  }
  const visited = await p.evaluate(() => SK_GAME.rooms.filter(r => r.visited).length);
  check('đi qua ≥3 phòng, bản đồ nhỏ ghi nhận', visited >= 3, visited + ' phòng đã vào');
  await p.screenshot({ path: path.join(SHOTS, 'minimap.png'), clip: { x: 1280 - 230, y: 0, width: 230, height: 280 } });
  await p.screenshot({ path: path.join(SHOTS, 'after3rooms.png') });

  // ---- tới cổng → 1-2
  await p.evaluate(() => SK_GAME.debug.teleportTo('end'));
  await sleep(300);
  const pre = await p.evaluate(() => SK_GAME.player);
  await p.screenshot({ path: path.join(SHOTS, 'portal.png') });
  await p.keyboard.down('KeyW');
  // Sau 1-1 game dừng ở cổng cho chọn buff (như SK); bấm phím 1 khi ba thẻ hiện ra.
  const t0 = Date.now(); let next = false, buffShown = false;
  while (Date.now() - t0 < 8000) {
    const st = await p.evaluate(() => ({ stage: SK_GAME.stage, buffs: !!(document.getElementById('sk-buffs') && !document.getElementById('sk-buffs').hidden) }));
    if (st.stage === '1-2') { next = true; break; }
    if (st.buffs) { buffShown = true; await p.keyboard.up('KeyW'); await p.keyboard.press('Digit1'); }
    await sleep(150);
  }
  await p.keyboard.up('KeyW');
  await sleep(700);
  await p.screenshot({ path: path.join(SHOTS, 'stage12.png') });
  const s2 = await p.evaluate(() => ({ stage: SK_GAME.stage, phase: SK_GAME.phase, pl: SK_GAME.player }));
  check('bước vào cổng → chọn buff → màn 1-2', next && buffShown, 'nhãn ' + s2.stage + ' · pha ' + s2.phase + ' · thẻ buff ' + buffShown);
  // Buff vừa chọn có thể cộng máu/năng lượng tối đa nên chỉ đòi không bị mất.
  check('máu / năng lượng / vàng / súng mang sang màn sau',
    s2.pl.hp >= pre.hp && s2.pl.energy >= pre.energy && s2.pl.gold === pre.gold && s2.pl.weapons.join() === pre.weapons.join(),
    'máu ' + s2.pl.hp + ' · nl ' + s2.pl.energy + ' · vàng ' + s2.pl.gold + ' · ' + s2.pl.weapons.join('/'));

  // ---- gục ngã → màn hình "Chơi lại" → về sảnh
  await p.evaluate(() => { SK_GAME.debug.god(false); SK.G.player.invulT = 0; SK.G.player.armor = 0; SK.hurtPlayer(SK.G, 99); });
  const over = await until(p, () => SK_GAME.state === 'dead' && !document.getElementById('sk-over').hidden, null, 4000);
  await p.screenshot({ path: path.join(SHOTS, 'gameover.png') });
  check('hết máu → màn "Bạn đã gục ngã"', over, await p.evaluate(() => document.getElementById('sk-over-info').textContent));
  await p.click('#sk-retry');
  const back = await until(p, () => SK_GAME.state === 'lobby' && !document.getElementById('sk-lobby').hidden, null, 2000);
  check('"Chơi lại" → về sảnh', back);

  check('không lỗi trang / console / HTTP (http)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

async function fileRun(b) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 500 } });
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs, true);
  await p.goto(FILE_URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.click('#sk-start');
  const ok = await until(p, () => SK_GAME.state === 'stage' && SK_GAME.stage === '1-1', null, 3000);
  await sleep(500);
  check('chạy từ file:// (không cần máy chủ)', ok && errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  const run = async (name, fn) => { try { await fn(b); } catch (e) { check(name + ': chạy trọn', false, e.message.split('\n')[0]); } };
  await run('http', mainRun);
  await run('file', fileRun);
  await b.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
