/*
 * Thế Giới Slime (games/world-of-slime): luồng Larus với bản đồ thật của server (data/maps/257, 110, 478).
 * Mở game -> ở quán trọ Larus (257) -> đi bộ bằng WASD xuống cầu thang ra cửa -> làng Larus (110) tải -> đi tới kho
 * -> vào kho (478) -> ra lại làng. Kiểm: đúng bản đồ, có NPC, có nhạc nền, không lỗi trang / console / HTTP >= 400, fps.
 * Đường đi tìm bằng BFS trên lưới va chạm thật (WOS.map.canStand, ô 0.5 m), lái bằng phím thật (8 hướng).
 *
 * Chạy cục bộ (gốc repo + repo asset có CORS):
 *   py -3.12 -m http.server 8841 --bind 127.0.0.1
 *   py -3.12 -I games/world-of-slime/tools/serve_cors.py 8842 D:/world-of-slime-assets
 *   node test/world-of-slime-larus.js
 * Trên Pages: WOS_BASE=https://poke5121999-art.github.io/survivor-web-hub/games/world-of-slime/ WOS_ASSETS= node test/world-of-slime-larus.js
 * Biến: WOS_BASE, WOS_ASSETS (rỗng = asset Pages), WOS_SHOTS (mặc định D:/wos-ref/proof/larus/test; "" = không chụp).
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = (process.env.WOS_BASE || 'http://127.0.0.1:8841/games/world-of-slime/').replace(/\/?$/, '/');
const ASSETS = process.env.WOS_ASSETS === undefined ? 'http://127.0.0.1:8842/' : process.env.WOS_ASSETS;
const SHOTS = process.env.WOS_SHOTS === undefined ? 'D:/wos-ref/proof/larus/test' : process.env.WOS_SHOTS;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };
const st = page => page.evaluate(() => ({ map: String(WOS.map.data.id), x: +WOS.P.x.toFixed(2), z: +WOS.P.z.toFixed(2), y: +WOS.P.y.toFixed(2),
  fps: WOS.stats.fps, npcs: WOS.npcs.map(n => n.def.name), bgm: WOS.audio.bgmName, playing: WOS.audio.bgmPlaying || null,
  detail: WOS.state.map.detail, switching: !!WOS.switching, errors: WOS.errors.slice(), maps: WOS.maps.slice() }));

// BFS trên ô 0.5 m từ vị trí người chơi tới (tx, tz); trả về các điểm rẽ (toạ độ Unity)
const plan = (page, tx, tz) => page.evaluate(([tx, tz]) => {
  const m = WOS.map, k = 2, W = m.width * k, H = m.height * k;
  const id = (x, z) => x + z * W, sx = Math.floor(WOS.P.x * k), sz = Math.floor(WOS.P.z * k), gx = Math.floor(tx * k), gz = Math.floor(tz * k);
  const prev = new Int32Array(W * H).fill(-1), q = [id(sx, sz)]; prev[q[0]] = q[0];
  const ok = (x, z, fx, fz) => x >= 0 && z >= 0 && x < W && z < H && m.canStand((x + 0.5) / k, (z + 0.5) / k, m.getHeight((fx + 0.5) / k, (fz + 0.5) / k))
    // thân người chơi ~0.5 m: tránh ô sát tường để không kẹt góc
    && [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([a, b]) => m.canStand((x + 0.5) / k + a, (z + 0.5) / k + b));
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, z = (c / W) | 0;
    if (x === gx && z === gz) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = id(x + dx, z + dz);
      if (prev[n] < 0 && ok(x + dx, z + dz, x, z) && (dx === 0 || dz === 0 || (ok(x + dx, z, x, z) && ok(x, z + dz, x, z)))) { prev[n] = c; q.push(n); }
    }
  }
  if (prev[id(gx, gz)] < 0) return null;
  const path = []; for (let c = id(gx, gz); c !== id(sx, sz); c = prev[c]) path.push([(c % W + 0.5) / k, (((c / W) | 0) + 0.5) / k]);
  path.reverse();
  return path.filter((p, i) => i % 3 === 2 || i === path.length - 1);
}, [tx, tz]);

// lái theo điểm rẽ bằng WASD; dừng khi tới nơi, khi bản đồ đổi (qua cửa), hoặc hết giờ
async function walk(page, pts, { untilMap, timeout = 40000 } = {}) {
  const k = page.keyboard, held = new Set(), t0 = Date.now();
  const hold = want => { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { if (want.includes(c) && !held.has(c)) { held.add(c); k.down(c); } else if (!want.includes(c) && held.has(c)) { held.delete(c); k.up(c); } } };
  let i = 0, s = null;
  while (Date.now() - t0 < timeout) {
    s = await st(page);
    if (untilMap && (s.map === untilMap || s.switching)) break;
    if (s.switching) { hold([]); await page.waitForTimeout(100); continue; }
    while (i < pts.length - 1 && Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z) < 0.45) i++;
    const [tx, tz] = pts[i], dx = tx - s.x, dz = tz - s.z;
    if (!untilMap && i === pts.length - 1 && Math.hypot(dx, dz) < 0.4) break;
    const want = []; const e = 0.15;
    if (dx > e) want.push('KeyD'); else if (dx < -e) want.push('KeyA');
    if (dz > e) want.push('KeyW'); else if (dz < -e) want.push('KeyS');
    hold(want); await page.waitForTimeout(40);
  }
  hold([]);
  return s;
}
const waitMap = (page, id, ms = 30000) => page.waitForFunction(id => String(WOS.map.data.id) === id && !WOS.switching && WOS.npcs.length > 0, id, { timeout: ms }).then(() => true, () => false);

async function main() {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('requestfailed', r => { if (!/\.ogg$/.test(r.url()) || !/ERR_ABORTED/.test((r.failure() || {}).errorText)) problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText); });
    page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
    const t0 = Date.now();
    await page.goto(BASE + 'index.html' + (ASSETS ? '?assets=' + encodeURIComponent(ASSETS) : ''));
    await page.waitForFunction(() => window.__ready || (window.__wosErrors || []).length, null, { timeout: 120000 });
    console.log('Mở game (index.html, không tham số) ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    await waitMap(page, '257', 20000);
    await page.mouse.click(640, 300);   // mở khoá âm thanh như người chơi bấm lần đầu
    await page.waitForTimeout(1500);
    let s = await st(page);
    check('bắt đầu ở quán trọ Larus (257)', s.map === '257', s.map);
    check('HUD tên bản đồ "Larus Tavern"', s.detail === 'Larus Tavern', s.detail);
    check('Amy có mặt', s.npcs.includes('Amy'), s.npcs.join(','));
    check('nhạc nền bgm_town_larus', s.bgm === 'bgm_town_larus' && !!s.playing, s.bgm + ' ' + s.playing);
    await shot(page, '1_tavern_start');

    console.log('Quán trọ -> làng (đi bộ xuống cầu thang phía đông)');
    let pts = await plan(page, 33.0, 20.0);
    check('có đường từ phòng ngủ ra cầu thang', !!pts, pts ? pts.length + ' điểm' : 'không có');
    if (pts) { pts.push([36, 20]); await walk(page, pts, { untilMap: '110', timeout: 60000 }); }
    const vOk = await waitMap(page, '110');
    s = await st(page);
    check('làng Larus (110) tải sau khi ra cửa', vOk && s.map === '110', s.map + ' ' + JSON.stringify(s.maps));
    check('làng có 7 NPC', s.npcs.length === 7, s.npcs.join(','));
    check('đứng trước cửa quán trọ', Math.hypot(s.x - 87.5, s.z - 69.6) < 1.5, s.x + ',' + s.z);
    await page.waitForTimeout(800); await shot(page, '2_village_arrive');
    const fpsV = (await st(page)).fps;

    console.log('Làng -> kho Larus (478)');
    pts = await plan(page, 83.5, 92.0);
    check('có đường tới cửa kho', !!pts, pts ? pts.length + ' điểm' : 'không có');
    if (pts) { pts.push([83.5, 94]); await walk(page, pts, { untilMap: '478', timeout: 60000 }); }
    const sOk = await waitMap(page, '478');
    s = await st(page);
    check('vào kho (478)', sOk && s.map === '478', s.map);
    check('Allen + Wisp trong kho', s.npcs.includes('Allen') && s.npcs.includes('Wisp'), s.npcs.join(','));
    check('HUD "Larus Storage"', s.detail === 'Larus Storage', s.detail);
    await page.waitForTimeout(800); await shot(page, '3_storage');

    console.log('Kho -> làng');
    pts = await plan(page, 32.5, 20.0);
    if (pts) { pts.push([32.5, 19.6]); await walk(page, pts, { untilMap: '110', timeout: 30000 }); }
    const bOk = await waitMap(page, '110');
    s = await st(page);
    check('ra lại làng trước cửa kho', bOk && s.map === '110' && Math.hypot(s.x - 83.5, s.z - 91.3) < 1.5, s.map + ' ' + s.x + ',' + s.z);
    await page.waitForTimeout(800); await shot(page, '4_village_back');

    s = await st(page);
    check('fps làng >= 20', fpsV >= 20, fpsV);
    check('không có lỗi WOS.errors', s.errors.length === 0, s.errors.join(' | '));
    check('không có lỗi trang / console / HTTP', problems.length === 0, problems.slice(0, 6).join(' | '));
    console.log('Đổi bản đồ: ' + JSON.stringify(s.maps));
    await ctx.close();
  } finally {
    clearTimeout(kill);
    await browser.close();
  }
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
