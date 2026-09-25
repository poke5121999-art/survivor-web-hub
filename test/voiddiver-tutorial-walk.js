/*
 * VOID DIVER — chơi tutorial 1100 như người mới, không dịch chuyển: đi bằng WASD (lái theo lưới đi của world.js), giữ F ở
 * Elara / cửa / rương, chuột trái đánh quái, Shift bật chạy qua hành lang bẫy, giữ Esc bỏ qua thoại, Ctrl tua nhanh.
 *
 * Chạy:  node test/voiddiver-tutorial-walk.js [--seed=7]
 *   Kiểm: 12 bước Lua đúng thứ tự, không kẹt (đứng yên > 2,5 s khi đang giữ phím), mỗi bảng hướng dẫn trên sàn nằm trong màn
 *   hình lúc người chơi đi qua (chụp ảnh từng bảng), cửa 1004/2005 mở bằng F, chìa 300000, chạy bật/tắt, tổng quãng đường.
 *   Hỏng nếu: pageerror, console error, response ≥ 400 (trừ SFX skill do module khác gọi). Ảnh ở %TEMP%/voiddiver-tutorial-shots/.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'voiddiver-tutorial-shots');
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

// Trong trang: đường đi BFS 8 hướng trên lưới NAV (ô bị chặn tính lại theo collider hiện tại, gồm cửa đóng), lái bằng WASD
// theo trục màn hình (render.screenAxes), đồng hồ quãng đường.
const HELPERS = () => {
  const W = VD.world;
  window.__path = function (tx, tz, arrive) {
    const p = VD.stage.player.pos, w = W.navW, h = W.navH;
    const [ai, aj] = W.navCell(p.x, p.z);
    const free = new Map();
    const ok = (i, j) => { const k = j * w + i; if (!free.has(k)) { const [x, z] = W.navCenter(i, j); free.set(k, !W.overlapsMove(x, z, 0.26)); } return free.get(k); };
    const prev = new Int32Array(w * h).fill(-2), q = [aj * w + ai]; prev[q[0]] = -1;
    let goal = -1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], i = c % w, j = (c / w) | 0;
      const [cx, cz] = W.navCenter(i, j);
      if (Math.hypot(cx - tx, cz - tz) <= arrive) { goal = c; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const n = nj * w + ni; if (prev[n] !== -2 || !ok(ni, nj)) continue;
        if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue;
        prev[n] = c; q.push(n);
      }
    }
    if (goal < 0) return null;
    const out = [];
    for (let c = goal; c >= 0; c = prev[c]) { const [x, z] = W.navCenter(c % w, (c / w) | 0); out.push({ x, z }); }
    return out.reverse();
  };
  window.__steer = function (tx, tz, arrive) {
    const u = VD.stage.player;
    const d0 = Math.hypot(u.pos.x - tx, u.pos.z - tz);
    if (d0 <= arrive) return { keys: [], done: true, d: d0 };
    const path = window.__path(tx, tz, arrive);
    if (!path) return { keys: [], err: 'không có đường', d: d0 };
    const tgt = path[Math.min(3, path.length - 1)];
    let dx = tgt.x - u.pos.x, dz = tgt.z - u.pos.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const ax = VD.render.screenAxes();
    const mx = dx * ax.right.x + dz * ax.right.z, my = dx * ax.fwd.x + dz * ax.fwd.z;
    const keys = [];
    if (my > 0.38) keys.push('KeyW'); if (my < -0.38) keys.push('KeyS');
    if (mx > 0.38) keys.push('KeyD'); if (mx < -0.38) keys.push('KeyA');
    return { keys, d: d0 };
  };
  window.__screen = function (x, z) { const v = new THREE.Vector3(x, 0.3, z).project(VD.render.camera); const c = VD.render.renderer.domElement; return { x: (v.x + 1) / 2 * c.clientWidth, y: (1 - v.y) / 2 * c.clientHeight, w: c.clientWidth, h: c.clientHeight }; };
  window.__odo = { d: 0, last: null };
  setInterval(() => { const u = VD.stage.player; if (!u) return; const o = window.__odo; if (o.last) o.d += Math.hypot(u.pos.x - o.last.x, u.pos.z - o.last.z); o.last = { x: u.pos.x, z: u.pos.z }; }, 100);
};

async function run(browser, port, errors) {
  console.log(`\n== Tutorial 1100 đi bộ bằng WASD (seed ${SEED})`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(`http://127.0.0.1:${port}/games/voiddiver/index.html?campaign=1100&seed=${SEED}&char=100001`);
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });
  await page.evaluate(HELPERS);
  await page.waitForFunction(() => VD.dive.state === 'play', null, { timeout: 60000 });   // thẻ tên tự qua sau 2 s

  const held = new Set();
  async function setKeys(keys) {
    for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  }
  const waitTrace = async (n, ms) => { try { await page.waitForFunction(n => VD.lua.trace.includes('tutorial:' + n), n, { timeout: ms || 20000 }); return true; } catch (e) { return false; } };
  const dialogOpen = () => page.evaluate(() => !!(VD.dialog && VD.dialog.open));
  // Hội thoại đang mở: 'skip' = đọc 2 dòng bằng F rồi giữ Esc bỏ qua; 'fast' = giữ Ctrl tới hết.
  async function dialogs(mode) {
    let n = 0;
    if (mode === 'fast') { await page.keyboard.down('Control'); try { await page.waitForFunction(() => !VD.dialog.open, null, { timeout: 60000 }); } catch (e) { /* báo ở dưới */ } await page.keyboard.up('Control'); return; }
    while (await dialogOpen()) {
      if (n >= 2) { await page.keyboard.down('Escape'); await sleep(1300); await page.keyboard.up('Escape'); try { await page.waitForFunction(() => !VD.dialog.open, null, { timeout: 30000 }); } catch (e) { /* báo ở dưới */ } break; }
      await page.waitForFunction(() => VD.dialog.box.style.visibility !== 'hidden', null, { timeout: 10000 }).catch(() => {});
      await sleep(500); await page.keyboard.press('KeyF'); n++;
    }
  }
  async function fight(radius, maxSec) {
    const t0 = Date.now();
    for (;;) {
      const m = await page.evaluate(r => { const u = VD.stage.player; const m = VD.dive.mons.filter(m => !m.dead && !m.removed && Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z) < r).sort((a, b) => Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) - Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z))[0]; return m ? { x: m.pos.x, z: m.pos.z, d: Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z) } : null; }, radius);
      if (!m || Date.now() - t0 > maxSec * 1000) { await setKeys([]); await page.mouse.up(); return m; }
      if (m.d > 1.6) { const s = await page.evaluate(([x, z]) => window.__steer(x, z, 1.4), [m.x, m.z]); await setKeys(s.keys || []); } else await setKeys([]);
      const p = await page.evaluate(([x, z]) => window.__screen(x, z), [m.x, m.z]);
      await page.mouse.move(p.x, p.y);
      if (m.d < 2.2) { await page.mouse.down(); await sleep(120); await page.mouse.up(); } else await sleep(80);
    }
  }
  const legs = [];
  async function walkTo(label, sel, arrive) {
    const tgt = await page.evaluate(sel => { const e = VD.dive.ents.find(new Function('e', 'return ' + sel)); return e ? { x: e.pos.x, z: e.pos.z } : null; }, sel);
    if (!tgt) { check(label + ': có mục tiêu', false, sel); return false; }
    const odo0 = await page.evaluate(() => window.__odo.d), t0 = await page.evaluate(() => VD.loop.time);
    let last = null, lastT = Date.now(), stuck = [];
    for (;;) {
      const near = await page.evaluate(() => VD.dive.mons.some(m => !m.dead && !m.removed && m.ai && m.ai.state === 'combat' && Math.hypot(m.pos.x - VD.stage.player.pos.x, m.pos.z - VD.stage.player.pos.z) < 5));
      if (near) await fight(6, 40);
      if (await dialogOpen()) { await setKeys([]); await dialogs('fast'); }
      if (await page.evaluate(() => !!VD.dive.cutscene || VD.dive.state !== 'play')) { await setKeys([]); break; }
      const s = await page.evaluate(([x, z, a]) => window.__steer(x, z, a), [tgt.x, tgt.z, arrive]);
      if (s.done) break;
      if (s.err) { await setKeys([]); check(label + ': tìm được đường', false, s.err + ' d=' + s.d.toFixed(1)); return false; }
      await setKeys(s.keys);
      await sleep(70);
      const pos = await page.evaluate(() => ({ x: VD.stage.player.pos.x, z: VD.stage.player.pos.z }));
      if (last && Math.hypot(pos.x - last.x, pos.z - last.z) < 0.25) {
        if (Date.now() - lastT > 2500) { stuck.push(pos.x.toFixed(1) + ',' + pos.z.toFixed(1)); lastT = Date.now(); if (stuck.length > 3) break; }
      } else { last = pos; lastT = Date.now(); }
    }
    await setKeys([]);
    const odo = await page.evaluate(() => window.__odo.d), t1 = await page.evaluate(() => VD.loop.time);
    const leg = { label, m: +(odo - odo0).toFixed(1), s: +(t1 - t0).toFixed(1) };
    legs.push(leg);
    check(label + ': tới nơi, không kẹt', stuck.length === 0, JSON.stringify(leg) + (stuck.length ? ' kẹt ở ' + stuck.join(' ') : ''));
    return true;
  }
  async function holdF(sec) { await page.keyboard.down('KeyF'); await gameWait(page, sec); await page.keyboard.up('KeyF'); }
  // Bảng hướng dẫn (VD.tutorial.list) có nằm trong màn hình không, rồi chụp.
  async function guideShot(guide, sector, name) {
    const g = await page.evaluate(([gn, sec]) => { const g = VD.tutorial.list().find(x => x.guide === gn && x.sector === sec); return g ? window.__screen(g.x, g.z) : null; }, [guide, sector]);
    check(`bảng ${sector}/${guide} trong màn hình`, g && g.x > 0 && g.x < g.w && g.y > 0 && g.y < g.h, g && `${g.x.toFixed(0)},${g.y.toFixed(0)}`);
    await shot(page, name);
  }

  // ---- mở màn: Step_00003, đọc 2 dòng rồi giữ Esc bỏ qua
  await page.waitForFunction(() => VD.dialog && VD.dialog.open && VD.dialog.box.style.visibility !== 'hidden', null, { timeout: 60000 });
  await sleep(800);
  await shot(page, 'walk-01-dialog');
  await dialogs('skip');
  check('bỏ qua thoại mở màn → HUD bật lại', await page.evaluate(() => !VD.dialog.open && VD.hud.root.style.display !== 'none'));
  await sleep(500);
  await guideShot('TutorialGuide_Move', 10009, 'walk-02-move-guide');

  await walkTo('Elara 1', "e.kind === 'trigger' && e.triggerId === 11002", 0.9);
  await holdF(0.8);
  check('giữ F ở Elara → TalkToEll_1', await waitTrace('TalkToEll_1'));
  await walkTo('cửa kính 1004', "e.kind === 'door' && e.row.Id === 1004", 1.0);
  await guideShot('FHoldTutorialGuide', 10009, 'walk-03-fhold-guide');
  await holdF(0.7);
  check('giữ F mở cửa 1004', await page.evaluate(() => VD.dive.ents.find(e => e.kind === 'door' && e.row.Id === 1004).open));
  await walkTo('va chạm 100091', "e.kind === 'collision' && e.triggerId === 100091", 0.8);
  check('CallCollision_1 (quái gần)', await waitTrace('CallCollision_1'));
  await sleep(300);
  await guideShot('AttackTutorialGuide', 10009, 'walk-04-attack-guide');
  await fight(9, 60);
  await walkTo('va chạm 100099', "e.kind === 'collision' && e.triggerId === 100099", 0.8);
  check('CallCollision_9', await waitTrace('CallCollision_9'));
  await walkTo('rương 1002', "e.kind === 'box' && e.row.Id === 1002", 0.9);
  await holdF(0.3);
  await page.waitForFunction(() => VD.inventory.open, null, { timeout: 8000 }).catch(() => {});
  // LootingInventory gốc: ô hé lộ lần lượt, bấm chuột trái lên ô đã hé lộ để lấy (F không còn là "lấy hết").
  await page.waitForFunction(() => VD.inventory.loot && VD.inventory.revealed(), null, { timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 30; i++) {
    const p = await page.evaluate(() => {
      const el = document.querySelector('.grid.loot .vs:not(.empty):not(.unrev):not(.reving)');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    if (!p) break;
    await page.mouse.click(p.x, p.y); await sleep(80);
  }
  await page.keyboard.press('Tab'); await sleep(300);
  check('lấy chìa 300000 trong rương', await page.evaluate(() => VD.inventory.count('Item', 300000) >= 1));
  await walkTo('va chạm 100098', "e.kind === 'collision' && e.triggerId === 100098", 0.6);
  check('CallCollision_8 (cửa khoá)', await waitTrace('CallCollision_8'));
  await guideShot('DirectionTutorialGuide', 10009, 'walk-05-arrow-gate');
  await walkTo('cửa sắt 2005', "e.kind === 'door' && e.row.Id === 2005", 1.0);
  await holdF(0.7);
  check('giữ F mở cửa sắt 2005 bằng chìa', await page.evaluate(() => VD.dive.ents.find(e => e.kind === 'door' && e.row.Id === 2005).open));
  await walkTo('va chạm 100092', "e.kind === 'collision' && e.triggerId === 100092", 1.0);
  check('CallCollision_2 (bẫy)', await waitTrace('CallCollision_2'));
  await sleep(300);
  await guideShot('RunTutorialGuide', 10001, 'walk-06-run-guide');
  await page.keyboard.press('ShiftLeft');
  await walkTo('qua hành lang bẫy tới 100093', "e.kind === 'collision' && e.triggerId === 100093", 1.0);
  check('Shift bật chạy suốt hành lang (không giữ)', await page.evaluate(() => VD.stage.player.runToggle === true || VD.stage.player.stamina <= 0));
  check('CallCollision_3 (rương)', await waitTrace('CallCollision_3'));
  await guideShot('ItemTutorialGuide', 10001, 'walk-07-item-guide');
  await walkTo('va chạm 100094', "e.kind === 'collision' && e.triggerId === 100094", 0.8);
  check('CallCollision_4 (căng thẳng 80)', await waitTrace('CallCollision_4'));
  await page.waitForFunction(() => VD.dive.mons.filter(m => m.id === 220009).length >= 3, null, { timeout: 30000 }).catch(() => {});
  await shot(page, 'walk-08-stress');
  await fight(10, 60);
  await walkTo('va chạm 100095', "e.kind === 'collision' && e.triggerId === 100095", 0.8);
  check('CallCollision_5 (máy bán hàng)', await waitTrace('CallCollision_5'));
  await guideShot('DirectionTutorialGuide_1', 10001, 'walk-09-arrow-east');
  await walkTo('va chạm 100096', "e.kind === 'collision' && e.triggerId === 100096", 1.0);
  check('CallCollision_6 (hết pin)', await waitTrace('CallCollision_6'));
  await sleep(300);
  await guideShot('DirectionTutorialGuide', 10004, 'walk-10-arrow-dark');
  await walkTo('Elara 2', "e.kind === 'trigger' && e.triggerId === 11003", 0.9);
  await holdF(0.8);
  check('giữ F ở Elara 2 → TalkToEll_2', await waitTrace('TalkToEll_2'));
  await page.waitForFunction(() => VD.dialog.open, null, { timeout: 15000 }).catch(() => {});
  await dialogs('skip');
  await guideShot('DirectionTutorialGuide_1', 10004, 'walk-11-arrow-boss');
  await walkTo('va chạm 100097', "e.kind === 'collision' && e.triggerId === 100097", 0.8);
  check('CallCollision_7 (cutscene boss)', await waitTrace('CallCollision_7'));
  await sleep(1200); await shot(page, 'walk-12-cutscene');
  await page.waitForFunction(() => VD.dialog.open, null, { timeout: 30000 }).catch(() => {});
  await dialogs('fast');
  const res = await page.waitForFunction(() => VD.dive.state === 'result' && !!document.querySelector('.vd-result'), null, { timeout: 60000 }).then(() => true, () => false);
  check('ép thoát → màn kết quả', res);
  await shot(page, 'walk-13-result');

  const tr = (await page.evaluate(() => VD.lua.trace.slice())).filter(t => t.startsWith('tutorial:')).map(t => t.slice(9));
  const want = ['Step_00003', 'TalkToEll_1', 'CallCollision_1', 'CallCollision_9', 'CallCollision_8', 'CallCollision_2', 'CallCollision_3', 'CallCollision_4', 'CallCollision_5', 'CallCollision_6', 'TalkToEll_2', 'CallCollision_7'];
  check('12 bước Lua đúng thứ tự', JSON.stringify(tr) === JSON.stringify(want), tr.join(' → '));
  const r = await page.evaluate(() => VD.dive.result && { escaped: VD.dive.result.escaped, cleared: VD.dive.result.campaignCleared, t: Math.round(VD.dive.t) });
  check('qua campaign 1100', r && r.escaped && r.cleared, JSON.stringify(r));
  const total = await page.evaluate(() => window.__odo.d);
  console.log('    quãng đường: ' + total.toFixed(1) + ' m; từng chặng: ' + legs.map(l => `${l.label} ${l.m} m/${l.s} s`).join('; '));
  check('tổng quãng đường đi bộ < 180 m', total < 180, total.toFixed(1) + ' m');
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try { await run(browser, srv.address().port, errors); } catch (e) { check('chạy hết không văng', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  // 404 tiếng/chân dung do module khác gọi thẳng (skill.js, buff.js: Skill_*_Hit, StatusEffect_*, San_*) là asset thiếu của
  // đường ống âm thanh: chỉ cảnh báo. 404 của bảng hướng dẫn, js, css, data thì hỏng.
  const other = errors.filter(e => /^HTTP 404 .*\/(audio|art\/ui\/(portrait|dialogimage))\//.test(e) || /^console: Failed to load resource: the server responded with a status of 404/.test(e));
  const mine = errors.filter(e => other.indexOf(e) < 0);
  if (other.length) console.log('  WARN lỗi tải do module khác (' + other.length + '): ' + [...new Set(other.filter(e => /HTTP/.test(e)))].slice(0, 4).join(' | '));
  check('không pageerror / console error / HTTP ≥ 400', mine.length === 0, mine.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log(`\n${pass} pass, ${fail} fail` + (fails.length ? '\n  hỏng: ' + fails.join('; ') : ''));
  console.log('ảnh: ' + OUT);
  process.exit(fail ? 1 : 0);
})();
