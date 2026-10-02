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

  // ---- Gục: xác nằm lại chỗ, không tự nổi về thuyền (bot kéo xác tắt để đo) ----
  const iC = byTac(L, 'cuuho').i;
  await page.evaluate(() => BDL_DEBUG.bodies.rescue(false));
  const spot = await page.evaluate(() => {
    const W = HX.game.world, S = HX_TUNING.water.surfaceY, b = BDL_DEBUG.ship.measure.world(0, 0);
    for (let dy = 8; dy < 14; dy += 1) for (const dx of [0, 2, -2, 4, -4, 6, -6]) {
      const x = b.x + dx, y = S - dy;
      if (W.open(x, y, 1.2) && W.open(x, y + 3, 0.8) && !W.raycast(x, y, x, S - 3)) return { x, y };
    }
    return null;
  });
  check('có chỗ nước thoáng ngay dưới thuyền để thử xác', !!spot, JSON.stringify(spot));
  await page.evaluate(([i, s]) => { BDL_DEBUG.mates.teleport(i, s.x, s.y); }, [iC, spot]);
  await sleep(400);
  const died = await page.evaluate(() => { BDL_DEBUG.bodies.kill('cuuho'); return BDL_DEBUG.bodies.list(); });
  const p0 = died[0] || { x: 0, y: 0 };
  await sleep(6000);
  let m = (await mates(page))[iC];
  const bl = await page.evaluate(() => BDL_DEBUG.bodies.list());
  const hullD = await page.evaluate(([x, y]) => { const b = BDL_DEBUG.ship.measure.world(0, 0); return Math.hypot(x - b.x, y - b.y); }, [m.x, m.y]);
  check('hết O₂ thì gục, có một xác', m.state === 'downed' && !m.alive && bl.length === 1 && bl[0].who === 'cuuho', m.state + ', xác ' + bl.length);
  check('6 s sau xác vẫn trong 3 m chỗ gục, chưa nổi về thuyền', bl.length === 1 && Math.hypot(bl[0].x - p0.x, bl[0].y - p0.y) < 3 && hullD > 5 && bl[0].state === 'down',
    'lệch ' + (bl[0] ? Math.hypot(bl[0].x - p0.x, bl[0].y - p0.y).toFixed(2) : '-') + ' m, cách thuyền ' + hullD.toFixed(1) + ' m, ' + (bl[0] && bl[0].state));
  check('người gục không nhận thêm sát thương (hurt → false)', (await page.evaluate(i => BDL_DEBUG.mates.hurt(i, 50), iC)) === false);

  // ---- Dave móc xác bằng súng xiên, kéo về, leo lên (E) → người gục hồi 25% O₂ trên boong ----
  const aimed = await page.evaluate(() => {
    const b = BDL.bodies.list[0], W = HX.game.world;
    for (let r = 2.5; r < 6; r += 0.5) for (const dx of [-r, r]) if (W.open(b.pos.x + dx, b.pos.y, 0.5) && !W.raycast(b.pos.x + dx, b.pos.y, b.pos.x, b.pos.y)) {
      BDL_DEBUG.teleport(b.pos.x + dx, b.pos.y);
      const d = HX.game.diver, tip = d.gunTip();
      d.state = 'swim';
      HX.game.harpoon.fire(tip.x, tip.y, Math.atan2(b.pos.y - tip.y, b.pos.x - tip.x));
      return true;
    }
    return false;
  });
  let hk = null;
  for (let t = 0; t < 20 && aimed; t++) { await sleep(150); hk = await page.evaluate(() => BDL_DEBUG.tether.info()); if (hk.state === 'attached') break; }
  check('mũi xiên móc được xác đồng đội', !!hk && hk.state === 'attached' && hk.target && hk.target.id < 0, hk ? hk.state + ' ' + JSON.stringify(hk.target) : 'không bắn được');
  const tow0 = (await page.evaluate(() => BDL_DEBUG.bodies.list()))[0];
  check('xác đang bị kéo (towed)', !!tow0 && tow0.state === 'towed' && tow0.tethered, tow0 && tow0.state);
  await page.keyboard.down('KeyW');
  let up = null, t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    up = await page.evaluate(() => ({ d: BDL_DEBUG.ship.info(), tt: BDL_DEBUG.tether.state() }));
    if (up.d.prompt === 'board') break;
    await sleep(300);
  }
  await page.keyboard.up('KeyW');
  check('Dave kéo xác lên tới thuyền (hiện lời nhắc leo)', !!up && up.d.prompt === 'board', up ? up.d.prompt + ' tether ' + up.tt + ' y=' + up.d.y.toFixed(1) : '');
  const tNow = await page.evaluate(() => BDL_DEBUG.tether.state());
  await page.keyboard.press('KeyE');
  await sleep(1200);
  m = (await mates(page))[iC];
  const after = await page.evaluate(() => ({ b: BDL_DEBUG.bodies.list(), deck: BDL_DEBUG.info().deck, cls: [...document.querySelectorAll('.mates-tag.down')].length }));
  check('leo lên: người gục hồi trên boong, O₂ ≈ 25%', tNow === 'attached' && m.state === 'deck' && Math.abs(m.o2 / m.o2Max - 0.25) < 0.03 && after.b.length === 0 && after.deck && after.cls === 0,
    tNow + ', ' + m.state + ', O₂ ' + (m.o2 / m.o2Max * 100).toFixed(0) + '%, xác ' + after.b.length + ', trên boong ' + after.deck);
  await page.screenshot({ path: path.join(SHOTS, '6-revived-on-boat.png') });

  // ---- Dave gục mà còn đồng đội: không hết ca, bot kéo Dave về thuyền, hồi 25% ----
  await page.evaluate(() => BDL_DEBUG.bodies.rescue(true));
  await page.keyboard.press('Space');
  await sleep(4500);
  await page.evaluate(([s]) => { BDL_DEBUG.teleport(s.x, s.y); BDL_DEBUG.bodies.kill('dave'); }, [spot]);
  await sleep(4000);
  let di = await info(page);
  const dl = await page.evaluate(() => BDL_DEBUG.bodies.list());
  check('Dave hết O₂ nhưng còn bot: lượt lặn chưa hết', di.phase === 'dive' && di.state === 'dead' && dl.some(b => b.who === 'dave') && (await page.evaluate(() => HX.game.deadCalls || 0)) === 0,
    di.phase + '/' + di.state + ', xác ' + dl.map(b => b.who + ':' + b.state).join());
  let revived = false; t0 = Date.now();
  while (Date.now() - t0 < 60000) { di = await info(page); if (di.deck && di.state !== 'dead') { revived = true; break; } await sleep(500); }
  const rescuers = (await mates(page)).reduce((a, x) => a + x.stat.rescues, 0);
  check('bot kéo Dave về thuyền trong 60 s, Dave hồi 25% O₂ trên boong', revived && Math.abs(di.o2 / di.o2max - 0.25) < 0.03 && rescuers >= 1,
    'trên boong ' + di.deck + ', ' + di.state + ', O₂ ' + (di.o2 / di.o2max * 100).toFixed(0) + '%, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, lần kéo ' + rescuers);
  await page.screenshot({ path: path.join(SHOTS, '6b-dave-revived.png') });
  await page.keyboard.press('Space');   // Dave nhảy lại xuống nước cho các phần sau
  await sleep(4500);

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

  // ---- hết người kéo: Dave gục trước rồi bot gục nốt → hết ca; và ngược lại (trang thử ?map= bỏ qua finishRun nên đếm G.onDead) ----
  await page.evaluate(() => { BDL_DEBUG.bodies.rescue(false); HX.game.deadCalls = 0; BDL_DEBUG.mates.setSquad(['thu', 'soi', 'nhu', 'tiepte']); });
  await sleep(7000);
  await page.evaluate(() => BDL_DEBUG.bodies.kill('dave'));
  await sleep(4000);
  const e1 = await page.evaluate(() => ({ b: BDL_DEBUG.bodies.list(), calls: HX.game.deadCalls || 0, ph: BDL_DEBUG.info().phase }));
  await page.evaluate(() => { for (const t of ['thu', 'soi', 'nhu']) BDL_DEBUG.bodies.kill(t); });
  await sleep(1000);
  const e2 = await page.evaluate(() => ({ calls: HX.game.deadCalls || 0 }));
  await page.evaluate(() => BDL_DEBUG.bodies.kill('tiepte'));
  await sleep(1500);
  const e3 = await page.evaluate(() => ({ b: BDL_DEBUG.bodies.list(), calls: HX.game.deadCalls || 0 }));
  check('Dave gục còn bot: có xác Dave, chưa hết ca', e1.b.some(b => b.who === 'dave') && e1.calls === 0 && e1.ph === 'dive', JSON.stringify(e1.b.map(b => b.who)) + ' gọi hết ca ' + e1.calls);
  check('còn một bot sống: vẫn chưa hết ca', e2.calls === 0, 'gọi hết ca ' + e2.calls);
  check('bot cuối gục khi Dave đang gục: hết ca (G.onDead gọi 1 lần, xác Dave gỡ)', e3.calls === 1 && !e3.b.some(b => b.who === 'dave') && e3.b.length === 4, 'gọi ' + e3.calls + ', xác ' + e3.b.map(b => b.who).join());
  // Dave sống lại (đứng lên boong) rồi cả tổ gục trước, sau đó Dave gục → hết ca ngay như cũ, không có xác Dave
  await page.evaluate(() => { HX.game.diver.o2 = 50; BDL_DEBUG.ship.board(); HX.game.deadCalls = 0; });
  await sleep(1500);
  await page.keyboard.press('Space');
  await sleep(4500);
  await page.evaluate(() => { BDL_DEBUG.mates.setSquad(['thu', 'soi']); });
  await sleep(6000);
  await page.evaluate(() => { for (const t of ['thu', 'soi']) BDL_DEBUG.bodies.kill(t); BDL_DEBUG.bodies.kill('dave'); });
  await sleep(4500);
  const f1 = await page.evaluate(() => ({ b: BDL_DEBUG.bodies.list(), calls: HX.game.deadCalls || 0 }));
  check('cả tổ gục rồi Dave gục: không có xác Dave, hết ca (G.onDead 1 lần)', f1.calls === 1 && !f1.b.some(b => b.who === 'dave') && f1.b.length === 2, 'gọi ' + f1.calls + ', xác ' + f1.b.map(b => b.who).join());

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
