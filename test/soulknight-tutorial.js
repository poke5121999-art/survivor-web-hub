/*
 * Lần chơi đầu của Hiệp Sĩ Linh Hồn (games/soulknight/js/tutorial.js), chơi bằng phím thật trên hồ sơ trống:
 * mở game (?tutorial=auto: bật luật "lần đầu" cho trình duyệt tự động) → màn kể chuyện 3 câu → ải hướng dẫn → bảng mẹo →
 * mở rương, nhặt Súng Máy → phòng đánh khoá rào, diệt quái (bất tử) → CLEAR → qua cả 7 phòng → cổng → màn tải → sảnh;
 * hồ sơ có cờ tutorialDone, tải lại trang thì vào thẳng sảnh. Đường đi giữa hai điểm tìm bằng BFS trên ô (chỉ để biết bấm phím nào).
 * Chạy: python -m http.server 8824 (ở gốc repo) rồi  node test/soulknight-tutorial.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.env.SK_URL || 'http://localhost:8824/games/soulknight/index.html';
const URL = BASE + (BASE.indexOf('?') >= 0 ? '&' : '?') + 'tutorial=auto';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-tutorial');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
}
let shotN = 0;
const shot = (p, name) => p.screenshot({ path: path.join(SHOTS, String(++shotN).padStart(2, '0') + '-' + name + '.png') });

// BFS trên ô đi được của G.map từ ô người chơi tới ô đích; trả điểm px kế tiếp còn thấy thẳng (kéo dây) để lái bằng phím.
function navStep(target) {
  const G = SK.G, W = SK.world, T = SK.TILE, p = G.player, m = G.map;
  if (!p || !m || G.state !== 'stage' || G.phase === 'portal') return { done: true, gone: true };
  const free = (x, y) => !W.solidTile(m, x, y) && !W.solidTile(m, x - 1, y) && !W.solidTile(m, x + 1, y) && !W.solidTile(m, x, y - 1);
  const sx = Math.floor(p.x / T), sy = Math.floor((p.y - 2) / T), tx = Math.floor(target[0] / T), ty = Math.floor(target[1] / T);
  if (Math.hypot(p.x - target[0], p.y - target[1]) < 7) return { done: true, x: p.x, y: p.y };
  const key = (x, y) => y * m.W + x, prev = new Map([[key(sx, sy), -1]]), q = [[sx, sy]];
  let found = null;
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) { found = [x, y]; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (prev.has(k)) continue;
      if (!(nx === tx && ny === ty) && !free(nx, ny)) continue;
      prev.set(k, key(x, y)); q.push([nx, ny]);
    }
  }
  if (!found) return { x: target[0], y: target[1], nopath: true, px: p.x, py: p.y };
  const pathT = [];
  for (let k = key(found[0], found[1]); k !== -1; k = prev.get(k)) pathT.unshift([k % m.W, Math.floor(k / m.W)]);
  let pick = pathT[Math.min(1, pathT.length - 1)];
  for (let i = pathT.length - 1; i >= 1; i--) {
    const c = pathT[i], cx = c[0] * T + 8, cy = c[1] * T + 10;
    if (W.los(m, p.x - 5, p.y - 3, cx - 5, cy - 3) && W.los(m, p.x + 5, p.y - 3, cx + 5, cy - 3) && W.los(m, p.x, p.y - 1, cx, cy - 1)) { pick = c; break; }
  }
  const last = pick === pathT[pathT.length - 1];
  return { x: last ? target[0] : pick[0] * T + 8, y: last ? target[1] : pick[1] * T + 10, px: p.x, py: p.y };
}

const held = new Set();
async function keys(p, want) {
  for (const k of [...held]) if (!want.has(k)) { await p.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await p.keyboard.down(k); held.add(k); }
}
// Đi tới điểm px (x, y) bằng WASD; extra: phím giữ thêm (KeyJ bắn). Trả true khi tới nơi.
async function walkTo(p, x, y, ms, extra) {
  const t0 = Date.now();
  let last = null, stuckT = Date.now();
  while (Date.now() - t0 < (ms || 20000)) {
    const s = await p.evaluate(navStep, [x, y]);
    if (s.done) { await keys(p, new Set(extra || [])); return true; }
    const dx = s.x - s.px, dy = s.y - s.py, want = new Set(extra || []);
    if (dx > 2) want.add('KeyD'); else if (dx < -2) want.add('KeyA');
    if (dy > 2) want.add('KeyS'); else if (dy < -2) want.add('KeyW');
    if (last && Math.hypot(s.px - last[0], s.py - last[1]) > 1) stuckT = Date.now();
    if (Date.now() - stuckT > 1200) { want.clear(); want.add(['KeyW', 'KeyA', 'KeyS', 'KeyD'][Math.floor(Math.random() * 4)]); stuckT = Date.now(); }
    last = [s.px, s.py];
    await keys(p, want);
    await sleep(60);
  }
  await keys(p, new Set());
  return false;
}
const roomsOf = p => p.evaluate(() => SK_GAME.rooms);
const st = p => p.evaluate(() => SK.tutorial.state);

// Đánh hết quái của phòng đang khoá: giữ J (tự ngắm quái gần nhất), đi về phía quái gần nhất.
async function fight(p, roomId, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await p.evaluate(id => { const r = SK_GAME.rooms[id]; const e = SK.G.enemies.filter(e => e.room && e.room.id === id && e.st !== 'dead'); return { state: r.state, n: e.length, x: e[0] && e[0].x, y: e[0] && e[0].y }; }, roomId);
    if (r.state === 'cleared') { await keys(p, new Set()); return true; }
    if (r.n) await walkTo(p, r.x, r.y + 18, 700, ['KeyJ']);
    else await keys(p, new Set(['KeyJ']));
    await sleep(80);
  }
  await keys(p, new Set());
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  const killer = setTimeout(() => { console.log('QUÁ GIỜ 8 phút'); process.exit(2); }, 8 * 60 * 1000);
  try {
    await p.goto(URL);
    const plot = await until(p, () => window.SK_GAME && SK_GAME.state === 'tut_plot', null, 10000);
    check('hồ sơ trống mở game → màn kể chuyện (không vào sảnh)', plot, await p.evaluate(() => window.SK_GAME && SK_GAME.state));
    await sleep(900);
    const s0 = await st(p);
    check('câu 1: ' + s0.plotText, s0.plotStep === 0 && /Đá Phép/.test(s0.plotText), JSON.stringify(s0));
    await shot(p, 'plot-1');
    await until(p, () => SK.tutorial.state.plotStep === 1, null, 5000);
    await sleep(700);
    const s1 = await st(p);
    check('sau 3 s tự sang câu 2 (màn đen 0,5 s)', s1.plotStep === 1 && /người xấu/.test(s1.plotText), JSON.stringify(s1));
    await shot(p, 'plot-2');
    await p.keyboard.press('Enter');
    await sleep(400);
    const s2 = await st(p);
    check('Enter: sang câu 3 ngay', s2.plotStep === 2 && /lấy lại/.test(s2.plotText), JSON.stringify(s2));
    await shot(p, 'plot-3');
    await p.keyboard.press('Enter');
    const lvl = await until(p, () => SK_GAME.state === 'stage' && SK_GAME.mode === 'tutorial', null, 5000);
    check('Enter: vào ải hướng dẫn (Hiệp Sĩ)', lvl && (await p.evaluate(() => SK.G.player.hero)) === 'knight');
    await until(p, () => SK_GAME.phase === 'play', null, 5000);
    const rooms = await roomsOf(p);
    check('7 phòng đặt sẵn: start, battle, chest, battle, chest, battle, end', rooms.map(r => r.type).join(',') === 'start,battle,chest,battle,chest,battle,end',
      rooms.map(r => r.type + ' ' + r.w + 'x' + r.h).join(' | '));
    await shot(p, 'start-room');

    // Bảng mẹo trong phòng đầu
    const signs = await p.evaluate(() => SK.tutorial.signs());
    const s1st = signs.find(s => s.tip === 'I_teaching_1');
    await walkTo(p, s1st.x + 12, s1st.y - 4, 15000);
    await sleep(300);
    const sn = await st(p);
    check('đứng cạnh bảng → hiện mẹo "' + s1st.text + '"', sn.near === 'I_teaching_1', JSON.stringify(sn));
    await shot(p, 'sign-tip');

    // Rương → Súng Máy
    const chest = (await p.evaluate(() => SK.tutorial.chests()))[0];
    await walkTo(p, chest.x, chest.y + 14, 10000);
    await p.keyboard.press('KeyE');
    await sleep(500);
    const opened = (await p.evaluate(() => SK.tutorial.chests()))[0].open;
    const item = await p.evaluate(() => SK.G.items.map(i => i.id));
    check('E mở rương → rơi vũ khí của RGChestAppoint (weapon_021 = Súng Máy)', opened && item.indexOf('blaster') >= 0, JSON.stringify(item));
    await shot(p, 'chest-open');
    const it = await p.evaluate(() => { const i = SK.G.items.find(i => i.id === 'blaster'); return [i.x, i.y]; });
    await walkTo(p, it[0], it[1] + 2, 6000);
    await p.keyboard.press('KeyE');
    await sleep(300);
    const w = await p.evaluate(() => SK_GAME.player.weapons);
    check('E nhặt Súng Máy (vũ khí thứ hai)', w.indexOf('blaster') >= 0, JSON.stringify(w));
    await shot(p, 'weapon-picked');

    await p.evaluate(() => SK_GAME.debug.god(true));
    // Phòng đánh 1: đi vào, rào khoá
    const b1 = rooms[1];
    await walkTo(p, b1.x, b1.y + (b1.h / 2 - 3) * 16, 25000);
    const locked = await until(p, id => SK_GAME.rooms[id].state === 'locked', b1.id, 4000);
    await sleep(500);
    const blk = await p.evaluate(id => SK_GAME.doorBlocked(id), b1.id);
    const en = await p.evaluate(() => SK.G.enemies.filter(e => e.st !== 'dead').map(e => e.id));
    check('vào phòng đánh → khoá rào, 2 quái e_orc02 đặt sẵn', locked && blk && en.length === 2 && en.every(id => id === 'e_orc02'), JSON.stringify({ locked, blk, en }));
    await shot(p, 'battle-lock');
    await p.evaluate(() => { window.__clr = 0; SK.on('roomClear', () => { window.__clr++; }); });
    const won = await fight(p, b1.id, 60000);
    check('giữ J diệt hết quái → phòng mở', won, JSON.stringify(await p.evaluate(id => SK_GAME.rooms[id], b1.id)));
    await sleep(250);
    const clr = await p.evaluate(() => window.__clr);
    await shot(p, 'clear');
    check('dọn phòng bắn sự kiện roomClear (hud.js vẽ chữ CLEAR)', clr === 1, String(clr));

    // Các phòng còn lại theo thứ tự đường đi
    for (let i = 2; i < rooms.length - 1; i++) {
      const r = rooms[i];
      const ok = await walkTo(p, r.x, r.y + 8, 30000);
      if (r.type === 'battle') {
        await until(p, id => SK_GAME.rooms[id].state !== 'idle', r.id, 3000);
        const won2 = await fight(p, r.id, 90000);
        check('phòng ' + i + ' (đánh): diệt hết quái', won2, JSON.stringify(await p.evaluate(id => [SK_GAME.rooms[id].state, SK.G.enemies.filter(e => e.st !== 'dead').map(e => e.id + ':' + e.hp)], r.id)));
        if (i === 5) await shot(p, 'elite-room');
      } else check('phòng ' + i + ' (' + r.type + '): tới được', ok);
    }
    // Cổng
    const portal = await p.evaluate(() => SK.G.portal && [SK.G.portal.x, SK.G.portal.y]);
    const end = await p.evaluate(() => SK.tutorial.signs().find(s => s.tip === 'I_teaching_3'));
    await walkTo(p, end.x + 12, end.y - 4, 30000);
    await sleep(300);
    await shot(p, 'portal-room');
    check('phòng cuối: bảng "Dùng Cửa Dịch Chuyển..." + cổng', !!portal && (await st(p)).near === 'I_teaching_3');
    await walkTo(p, portal[0], portal[1], 8000);
    const load = await until(p, () => SK.loading && SK.loading.on, null, 3000);
    await sleep(600);
    check('bước vào cổng → màn tải', load);
    await shot(p, 'loading');
    const hall = await until(p, () => SK_GAME.state === 'hall', null, 8000);
    const flag = await p.evaluate(() => JSON.parse(localStorage.getItem('sk.profile.v1')).flags);
    check('màn tải → sảnh, hồ sơ có cờ tutorialDone', hall && flag && flag.tutorialDone === 1, JSON.stringify(flag));
    await sleep(800);
    await shot(p, 'hall');

    await p.reload();
    await until(p, () => window.SK_GAME && SK_GAME.state !== 'lobby' && document.body.classList.contains('ready'), null, 10000);
    await sleep(1200);
    const again = await p.evaluate(() => SK_GAME.state);
    check('tải lại trang → vào thẳng sảnh, không chạy lại hướng dẫn', again === 'hall', again);
    await shot(p, 'reload-hall');

    // Móc gỡ lỗi + cờ URL
    await p.evaluate(() => SK_GAME.debug.tutorial());
    check('SK_GAME.debug.tutorial() từ sảnh → màn kể chuyện', await until(p, () => SK_GAME.state === 'tut_plot', null, 2000));
    await p.goto(BASE + (BASE.indexOf('?') >= 0 ? '&' : '?') + 'tutorial=1');
    check('?tutorial=1 ép chạy dù hồ sơ đã có cờ', await until(p, () => window.SK_GAME && SK_GAME.state === 'tut_plot', null, 10000));
    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p2 = await ctx2.newPage();
    await p2.goto(URL + '&quick=1');
    await until(p2, () => document.body.classList.contains('ready'), null, 10000);
    await sleep(800);
    const q = await p2.evaluate(() => SK_GAME.state);
    check('hồ sơ trống + ?quick=1 → không chạy hướng dẫn (vào thẳng màn chọn cũ)', q === 'lobby', q);
    await ctx2.close();
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  clearTimeout(killer);
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n  ảnh: ${SHOTS}\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
