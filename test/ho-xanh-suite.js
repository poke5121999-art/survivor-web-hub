/*
 * HỐ XANH — bộ kiểm.
 *
 * Chạy:  node test/ho-xanh-suite.js
 * Ảnh chụp ra thư mục SHOTS (mặc định %TEMP%/ho-xanh-shots) — mở ra xem bằng mắt.
 * Chạy ở 1280×720 và 844×390, bản đồ cố định A01 (?map=A01) để kỳ vọng viết cứng được.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
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

// Điểm trong đa giác (chẵn-lẻ) — viết riêng ở đây, không mượn world.js của game.
function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const info = () => page.evaluate(() => HX_DEBUG.info());
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });

  await page.goto(base + '/games/ho-xanh/index.html?map=A01');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  check('màn đầu hiện tên game', (await page.textContent('#title h1')) === 'Hố Xanh');
  await sleep(400);
  await shot('1-title');

  await page.click('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  let I = await info();
  check('nạp đúng bản đồ A01', I.levelId === 'A01', I.levelId);
  check('glb A01 nạp đủ 166 mảnh lưới', I.glbMeshes === 166, String(I.glbMeshes));
  check('Dave bắt đầu bằng pha nhảy xuống nước', I.dave.state === 'enter', I.dave.state);
  check('giải mã đủ 34 tệp tiếng gốc', I.sounds === 34, String(I.sounds));
  // Ghi lại tên tiếng được gọi để biết đòn xiên có nối đúng tiếng.
  await page.evaluate(() => { const orig = HX.audio.play; window.__played = []; HX.audio.play = function (k, o) { window.__played.push(k); return orig(k, o); }; });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 });
  await sleep(600);

  // Dave có thật trên hình: ẩn Dave đi thì vùng quanh Dave phải đổi nhiều điểm ảnh.
  const dvS = await page.evaluate(() => { const d = HX_DEBUG.info().dave; return HX_DEBUG.worldToScreen(d.x, d.y); });
  const clip = { x: Math.max(0, dvS.x - 40), y: Math.max(0, dvS.y - 40), width: 80, height: 80 };
  await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); HX.game.fx.clear(); HX.game.fx.group.visible = false; });
  await sleep(100);
  const withDave = await page.screenshot({ clip });
  await page.evaluate(() => { HX.game.diver.root.visible = false; });
  await sleep(80);
  const noDave = await page.screenshot({ clip });
  await page.evaluate(() => { HX.game.diver.root.visible = true; HX.game.fx.group.visible = true; });
  const diffBytes = withDave.length !== noDave.length || !withDave.equals(noDave);
  check('Dave được vẽ ra màn hình (ẩn Dave thì ảnh vùng quanh Dave khác đi)', diffBytes);
  await page.evaluate(() => HX_DEBUG.holdSpawns(false));
  await sleep(900);
  await shot('2-dive-near-surface');

  // Bơi thẳng vào vách: không lần nào tâm Dave nằm trong đa giác đá.
  const walls = await page.evaluate(() => HX_LEVELS.A01.walls);
  const setup = await page.evaluate(() => {
    const W = HX.game.world;
    for (let y = 8; y > -30; y -= 0.7) for (let x = -40; x < 40; x += 0.9) {
      if (!W.open(x, y, 0.6)) continue;
      const hit = W.raycast(x, y, x + 3, y);
      if (hit && hit.x - x > 1.5 && W.open(x, y + 0.5, 0.4)) return { x, y, wallX: hit.x };
    }
    return null;
  });
  check('tìm được chỗ vách đá ngay bên phải để thử va chạm', !!setup, JSON.stringify(setup));
  if (setup) {
    await page.evaluate(s => HX_DEBUG.teleport(s.x, s.y), setup);
    await page.keyboard.down('KeyD');
    let insideCount = 0, maxX = -1e9, samples = 0;
    for (let i = 0; i < 40; i++) {
      await sleep(50);
      const d = (await info()).dave;
      samples++;
      if (walls.some(p => inside(p, d.x, d.y))) insideCount++;
      maxX = Math.max(maxX, d.x);
      if (i === 20) await page.keyboard.down('KeyS');
    }
    await page.keyboard.up('KeyD'); await page.keyboard.up('KeyS');
    check('bơi vào vách 2 giây: Dave không lọt vào đá lần nào', insideCount === 0, insideCount + '/' + samples + ' mẫu nằm trong đá');
    check('Dave chạm tới sát vách (cách mép < 0.4 m)', setup.wallX - maxX < 0.4, 'mép ' + setup.wallX.toFixed(2) + ', xa nhất ' + maxX.toFixed(2));
  }

  // Xiên cá: đặt một con cá hề đứng yên trước mặt Dave rồi bắn.
  await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); });
  const spot = await page.evaluate(() => {
    const W = HX.game.world;
    for (let y = 10; y > -25; y -= 0.8) for (let x = -35; x < 35; x += 1.1) {
      if (W.open(x, y, 0.7) && W.open(x + 1.9, y, 0.5) && !W.raycast(x, y, x + 2.2, y)) return { x, y };
    }
    return null;
  });
  await page.evaluate(s => HX_DEBUG.teleport(s.x, s.y), spot);
  await sleep(700);
  const d0 = (await info()).dave;
  const fx = d0.x + 1.9, fy = d0.y + 0.1;
  await page.evaluate(([x, y]) => HX_DEBUG.spawnFish('ClownFish', x, y, true), [fx, fy]);
  await sleep(150);
  const fS = await page.evaluate(([x, y]) => HX_DEBUG.worldToScreen(x, y), [fx, fy]);
  await page.mouse.move(fS.x, fS.y);
  await page.mouse.down();
  await sleep(220);
  await shot('3-aim');
  await page.mouse.up();
  let hitSeen = false;
  for (let i = 0; i < 10 && !hitSeen; i++) {
    await sleep(25);
    const st = (await info()).harpoon;
    if (st === 'stuck') { hitSeen = true; await shot('4-harpoon-hit'); }
  }
  check('mũi xiên cắm vào cá (harpoon = stuck)', hitSeen);
  await page.waitForFunction(() => HX_DEBUG.info().catches.length > 0, null, { timeout: 5000 }).catch(() => {});
  I = await info();
  check('bắt được đúng con cá hề', JSON.stringify(I.catches) === '["ClownFish"]', JSON.stringify(I.catches));
  await sleep(350);
  const card = await page.evaluate(() => ({ show: document.getElementById('catch-card').classList.contains('show'), name: document.getElementById('cc-name').textContent }));
  check('thẻ bắt cá hiện tên "Cá hề"', card.show && card.name === 'Cá hề', JSON.stringify(card));
  const played = await page.evaluate(() => window.__played);
  const want = ['harpoon_aim', 'harpoon_shot', 'harpoon_hit', 'harpoon_catch'];
  check('đòn xiên phát đủ tiếng ngắm, bắn, trúng, bắt', want.every(k => played.includes(k)), played.join(','));
  await shot('5-catch-popup');
  check('mũi xiên về lại tay Dave', (await page.waitForFunction(() => HX_DEBUG.info().harpoon === 'ready', null, { timeout: 3000 }).then(() => true, () => false)));

  // Dao: cá hề 3 máu, dao 2 sát thương → đâm hai nhát thì cá chết và trôi về tay Dave.
  const d1 = (await info()).dave;
  const face = await page.evaluate(() => HX.game.diver.facing);
  await page.evaluate(([x, y]) => HX_DEBUG.spawnFish('ClownFish', x, y, true), [d1.x + face * 0.4, d1.y + 0.05]);
  await page.keyboard.press('KeyF');
  await sleep(800);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => HX_DEBUG.info().catches.length === 2, null, { timeout: 4000 }).catch(() => {});
  I = await info();
  check('hai nhát dao hạ được cá hề thứ hai', JSON.stringify(I.catches) === '["ClownFish","ClownFish"]', JSON.stringify(I.catches));
  const played2 = await page.evaluate(() => window.__played);
  check('dao phát tiếng vung và tiếng trúng', played2.includes('knife') && played2.includes('melee_hit'), played2.slice(-6).join(','));

  // Xuống sâu để chụp màu nước đáy.
  const deep = await page.evaluate(() => {
    const W = HX.game.world;
    for (let y = -22; y > -33; y -= 0.6) for (let x = -40; x < 40; x += 0.9) if (W.open(x, y, 2.2)) return { x, y };
    return null;
  });
  if (deep) {
    await page.evaluate(() => HX_DEBUG.holdSpawns(false));
    await page.evaluate(s => HX_DEBUG.teleport(s.x, s.y), deep);
    await sleep(1400);
    I = await info();
    check('độ sâu hiển thị khớp vị trí Dave', (await page.textContent('#depth')) === Math.round(I.surfaceY - I.dave.y) + ' m', await page.textContent('#depth'));
    await shot('6-dive-deep');
  }

  // Cạn dưỡng khí: ngất, chỉ giữ một con (con hạng cao nhất).
  await page.evaluate(() => { HX_DEBUG.giveCatch('Yellow_Tang'); HX_DEBUG.giveCatch('Titan_Triggerfish'); HX_DEBUG.setO2(0.4); });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'dead', null, { timeout: 4000 }).catch(() => {});
  check('dưỡng khí tự tụt về 0 thì Dave ngất', (await info()).dave.state === 'dead');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'result', null, { timeout: 8000 });
  await sleep(400);
  const dead = await page.evaluate(() => ({
    title: document.getElementById('r-title').textContent,
    ids: [...document.querySelectorAll('#r-grid .r-fish')].map(e => e.dataset.id),
  }));
  check('màn kết quả khi ngất: tiêu đề "Bạn ngất đi…"', dead.title === 'Bạn ngất đi…', dead.title);
  check('ngất thì chỉ giữ đúng 1 con: cá bò titan (hạng cao nhất trong 4 con)', JSON.stringify(dead.ids) === '["Titan_Triggerfish"]', JSON.stringify(dead.ids));
  await shot('7-result-dead');

  // Lặn tiếp, bơi lên mặt nước là về bờ.
  await page.click('#r-again');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 60000 });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 });
  check('lượt mới bắt đầu với túi cá trống', (await info()).catches.length === 0);
  const up = await page.evaluate(() => {
    const W = HX.game.world, sy = HX_TUNING.water.surfaceY;
    for (let x = -30; x < 30; x += 0.7) if (W.open(x, sy - 1.6, 0.5) && !W.raycast(x, sy - 1.6, x, sy)) return { x, y: sy - 1.6 };
    return null;
  });
  await page.evaluate(() => HX_DEBUG.giveCatch('Bluetang'));
  await page.evaluate(s => HX_DEBUG.teleport(s.x, s.y), up);
  await page.keyboard.down('KeyW');
  const surfaced = await page.waitForFunction(() => HX_DEBUG.info().phase === 'result', null, { timeout: 8000 }).then(() => true, () => false);
  await page.keyboard.up('KeyW');
  check('bơi lên tới mặt nước thì kết thúc lượt', surfaced);
  await sleep(600);
  const res = await page.evaluate(() => ({
    title: document.getElementById('r-title').textContent, outcome: HX_DEBUG.info().outcome,
    ids: [...document.querySelectorAll('#r-grid .r-fish')].map(e => e.dataset.id),
  }));
  check('màn kết quả khi lên bờ: "Lên bờ rồi!" và giữ cả túi', res.title === 'Lên bờ rồi!' && res.outcome === 'surface' && JSON.stringify(res.ids) === '["Bluetang"]', JSON.stringify(res));
  await shot('8-result-surface');

  check('không có lỗi trang, lỗi console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
