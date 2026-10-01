/*
 * BIỆT ĐỘI LẶN — bộ kiểm đồng đội lặn cùng (js/mates.js).
 *
 * Chạy:  node test/biet-doi-lan-mates.js
 * Trang thử ?map=0&mates=loot,baoke,san,cuuho ở 1280×720. Ảnh ra %TEMP%/bdl-mates-shots (đổi bằng SHOTS=...).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-mates-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
const mates = page => page.evaluate(() => BDL_DEBUG.mates.list());
const info = page => page.evaluate(() => BDL_DEBUG.info());
const byTac = (L, t) => L.find(m => m.tactic === t);

async function run(page, base) {
  const errors = watch(page);
  await page.goto(base + '/games/biet-doi-lan/index.html?map=0&mates=loot,baoke,san,cuuho&seed=11');
  const reached = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive' && BDL_DEBUG.mates, null, { timeout: 120000 }).then(() => true, () => false);
  check('vào pha dive', reached);
  if (!reached) { check('không lỗi trang', false, errors.slice(0, 3).join(' | ')); return; }
  await sleep(1500);

  // ---- tổ 4 người, màu khác nhau, có nhãn tên, đứng trên boong ----
  let L = await mates(page);
  check('có 4 đồng đội', L.length === 4, L.map(m => m.name + '/' + m.tactic).join(', '));
  check('4 màu đồ khác nhau', new Set(L.map(m => m.hue)).size === 4, L.map(m => m.hue).join(','));
  check('sheet đổi màu đã sinh', L.every(m => m.sheet));
  const tags = await page.evaluate(() => [...document.querySelectorAll('.mates-tag')].filter(e => !e.hidden).map(e => e.textContent));
  check('4 nhãn tên + chiến thuật trên đầu', tags.length === 4, tags.join(' | '));
  check('đầu lượt đứng trên boong', L.every(m => m.state === 'deck'), L.map(m => m.state).join(','));
  const ca = await page.evaluate(() => ({ mates: BDL.run.ca.crew.mates.length, quota: BDL.run.dive.quota, total: BDL.run.dive.lootTotal, mul: BDL.run.crewMul() }));
  check('ca có tổ (chỉ tiêu tính cả tổ)', ca.mates === 4, 'crewMul ' + ca.mul.toFixed(2) + ', chỉ tiêu ' + ca.quota + ' / tổng ' + ca.total);
  const sheet = await page.evaluate(() => BDL_DEBUG.mates.crewSheet(3));
  fs.writeFileSync(path.join(SHOTS, 'crew-sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  await page.screenshot({ path: path.join(SHOTS, '1-deck.png') });

  // ---- Dave nhảy (Space) → đồng đội nhảy theo ----
  const pile0 = (await page.evaluate(() => BDL_DEBUG.ship.info().pile));
  const deck0 = (await info(page)).run.onDeck;
  await page.keyboard.press('Space');
  const tJump = Date.now();
  await sleep(1200);
  L = await mates(page);
  const stillDeck = L.filter(m => m.state === 'deck').length;
  await sleep(3500);
  L = await mates(page);
  check('rời boong sau khi Dave nhảy', L.every(m => m.state !== 'deck'), L.map(m => m.state).join(',') + ' (1,2 s sau nhảy còn ' + stillDeck + ' trên boong)');
  await page.screenshot({ path: path.join(SHOTS, '2-squad-water.png') });

  // ---- Bảo kê bám Dave khi Dave bơi ----
  const dists = [];
  const moves = [['KeyD', 3000], ['KeyS', 2500], ['KeyA', 3500], ['KeyW', 1500], ['KeyD', 2500]];
  for (const [k, ms] of moves) {
    await page.keyboard.down(k);
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const r = await page.evaluate(() => { const d = HX.game.diver.pos, m = BDL_DEBUG.mates.list().find(x => x.tactic === 'baoke'); return Math.hypot(m.x - d.x, m.y - d.y); });
      dists.push(r);
      await sleep(400);
    }
    await page.keyboard.up(k);
  }
  await sleep(1500);
  for (let i = 0; i < 8; i++) { dists.push(await page.evaluate(() => { const d = HX.game.diver.pos, m = BDL_DEBUG.mates.list().find(x => x.tactic === 'baoke'); return Math.hypot(m.x - d.x, m.y - d.y); })); await sleep(400); }
  const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
  check('Bảo kê ở trong 6 m quanh Dave (trung bình)', avg < 6, 'trung bình ' + avg.toFixed(2) + ' m, xa nhất ' + Math.max(...dists).toFixed(1) + ' m, ' + dists.length + ' mẫu');
  await page.screenshot({ path: path.join(SHOTS, '3-escort.png') });

  // ---- Cứu hộ tiếp O₂ ----
  await page.evaluate(() => BDL_DEBUG.hurt(60));
  const o2a = (await info(page)).o2;
  let o2b = o2a, healed = false;
  for (let t = 0; t < 40 && !healed; t++) {
    await sleep(500);
    o2b = (await info(page)).o2;
    healed = o2b >= o2a + 19;
  }
  L = await mates(page);
  check('Cứu hộ tiếp O₂ khi Dave dưới 50%', healed, 'O₂ ' + o2a.toFixed(0) + ' → ' + o2b.toFixed(0) + ', lần tiếp ' + byTac(L, 'cuuho').stat.refills);

  // ---- Săn quái: quái thức sinh gần người săn ----
  const spawned = await page.evaluate(() => {
    const m = BDL_DEBUG.mates.list().find(x => x.tactic === 'san'), W = HX.game.world;
    for (let r = 3; r < 10; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) {
      const x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r;
      if (y < HX_TUNING.water.surfaceY - 2 && W.open(x, y, 1.2)) return { id: BDL_DEBUG.foes.spawn('rook', x, y)[0], x, y };
    }
    return null;
  });
  check('sinh được quái thức gần người săn', !!spawned, spawned ? 'rook #' + spawned.id : '');
  let foeHit = null;
  for (let t = 0; t < 60 && spawned; t++) {
    await sleep(500);
    const f = await page.evaluate(id => BDL_DEBUG.foes.get(id), spawned.id);
    if (!f || f.dead || f.hp < f.hpMax) { foeHit = f || { dead: true }; break; }
  }
  L = await mates(page);
  const san = byTac(L, 'san');
  check('Săn quái đánh trúng / hạ quái', !!foeHit && san.stat.hits > 0, foeHit ? 'hp ' + (foeHit.hp != null ? foeHit.hp.toFixed(0) + '/' + foeHit.hpMax : '-') + (foeHit.dead ? ' (chết)' : '') + ', nhát trúng ' + san.stat.hits + ', hạ ' + san.stat.kills : 'không thấy');

  // ---- Khuân đồ: chụp lúc kéo, chờ lên thuyền ----
  let shot = false, delivered = false, last = null;
  while (Date.now() - tJump < 90000) {
    L = await mates(page);
    const lm = byTac(L, 'loot');
    last = lm;
    if (!shot && lm.rope) {
      await page.evaluate(m => {
        const W = HX.game.world;
        for (let r = 1.5; r < 6; r += 0.5) for (const dx of [-r, r]) if (W.open(m.x + dx, m.y + 1, 0.5)) return BDL_DEBUG.teleport(m.x + dx, m.y + 1);
      }, lm);
      await sleep(700);
      await page.screenshot({ path: path.join(SHOTS, '4-haul.png') });
      shot = true;
    }
    if (lm.stat.delivered >= 1) { delivered = true; break; }
    await sleep(500);
  }
  const s = await info(page), pile1 = await page.evaluate(() => BDL_DEBUG.ship.info().pile);
  check('Khuân đồ giao ≥1 món trong 90 s', delivered, last ? 'giao ' + last.stat.delivered + ' món ' + last.stat.value + ', pha ' + last.phase + ', đứt dây ' + last.stat.snaps + ', ' + ((Date.now() - tJump) / 1000).toFixed(0) + ' s' : '');
  check('tiền trên boong tăng, đống đồ lớn thêm', s.run.onDeck > deck0 && pile1 > pile0, 'boong ' + deck0 + ' → ' + s.run.onDeck + ', đống ' + pile0 + ' → ' + pile1);
  check('đã chụp lúc đang kéo đồ', shot);
  if (delivered) await page.screenshot({ path: path.join(SHOTS, '5-after-deliver.png') });

  // ---- Gục: nổi về thuyền ----
  const iC = byTac(L, 'cuuho').i;
  await page.evaluate(i => BDL_DEBUG.mates.hurt(i, 999), iC);
  await sleep(300);
  let m = (await mates(page))[iC];
  check('hết O₂ thì gục', m.state === 'downed' && !m.alive, m.state);
  let boarded = false;
  for (let t = 0; t < 120 && !boarded; t++) { await sleep(500); m = (await mates(page))[iC]; boarded = m.state === 'board'; }
  check('người gục nổi về thuyền và nằm trên boong', boarded && m.y > 19, m.state + ' y=' + m.y.toFixed(1));
  await page.evaluate(i => { const m = BDL_DEBUG.mates.list()[i]; BDL_DEBUG.teleport(m.x + 3, 18); }, iC);
  await sleep(800);
  await page.screenshot({ path: path.join(SHOTS, '6-downed-on-boat.png') });

  // ---- bốn chiến thuật còn lại: đổi tổ giữa lượt (nhảy xuống ngay vì Dave đang ở dưới nước) ----
  await page.evaluate(() => BDL_DEBUG.teleport(-40, 16));
  L = await page.evaluate(() => BDL_DEBUG.mates.setSquad(['thu', 'soi', 'nhu', 'tiepte']));
  check('đổi tổ giữa lượt', L.length === 4 && L.map(x => x.tactic).join() === 'thu,soi,nhu,tiepte', L.map(x => x.name + '/' + x.tactic).join(', '));
  await sleep(9000);
  const sk = await page.evaluate(() => {
    BDL_DEBUG.skill.resetCd();
    const ok = BDL_DEBUG.skill.cast();
    return { ok, max: BDL.skill.cdMax };
  });
  await sleep(400);
  const sk2 = await page.evaluate(() => ({ left: BDL.skill.cdLeft, m: BDL_DEBUG.mates.list().find(x => x.tactic === 'tiepte') }));
  check('Tiếp tế cắt 15% hồi chiêu khi Dave tung kỹ năng', sk.ok && sk2.m.stat.assists === 1 && sk2.left <= sk.max * 0.86,
    'tung ' + sk.ok + ', hồi ' + sk2.left.toFixed(1) + ' / ' + sk.max.toFixed(1) + ' s, cách Dave ' + (await page.evaluate(() => { const d = HX.game.diver.pos, m = BDL_DEBUG.mates.list().find(x => x.tactic === 'tiepte'); return Math.hypot(m.x - d.x, m.y - d.y).toFixed(1); })) + ' m');
  const boatD = [];
  for (let t = 0; t < 70; t++) {
    await sleep(500);
    boatD.push(await page.evaluate(() => { const m = BDL_DEBUG.mates.list().find(x => x.tactic === 'thu'), b = BDL_DEBUG.ship.measure.world(0, 0); return Math.hypot(m.x - b.x, m.y - b.y); }));
  }
  L = await mates(page);
  const avgB = boatD.reduce((a, b) => a + b, 0) / boatD.length;
  check('Thủ thuyền quanh thuyền (trung bình < 15 m)', avgB < 15, avgB.toFixed(1) + ' m, ' + byTac(L, 'thu').state + '/' + byTac(L, 'thu').phase);
  const so = byTac(L, 'soi'), nh = byTac(L, 'nhu');
  check('Soi đáy đánh dấu đồ cổ ở tầng sâu', so.stat.revealed > 0, 'đã soi ' + so.stat.revealed + ' món, đang ở y=' + so.y.toFixed(1) + ' (' + so.phase + ')');
  check('Nhử mồi ra chỗ xa gây tiếng', nh.stat.noises > 0, 'tiếng ' + nh.stat.noises + ', pha ' + nh.phase);
  await page.screenshot({ path: path.join(SHOTS, '7-squad2.png') });

  // lỗi trong BDL.onDeliver của hệ thuyền (đống đồ, js/ship.js) tách riêng: không phải lỗi của bot nhưng vẫn tính trượt
  const all = errors.concat((await info(page)).errors), shipErr = all.filter(e => /ship\.js|onDeliver/.test(e)), rest = all.filter(e => !/ship\.js|onDeliver/.test(e));
  check('không lỗi trang / console / HTTP / hệ', rest.length === 0, rest.slice(0, 4).join(' | '));
  check('đống đồ trên boong (ship.js) nhận đồ của bot không lỗi', shipErr.length === 0, shipErr.slice(0, 1).join('').slice(0, 220));
  console.log('  nav ' + JSON.stringify(await page.evaluate(() => BDL_DEBUG.mates.nav())) + '; ' + JSON.stringify((await mates(page)).map(x => [x.name, x.tactic, x.state, x.phase, x.stat])));
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await run(page, base);
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
