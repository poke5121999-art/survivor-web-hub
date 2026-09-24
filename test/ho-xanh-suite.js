/*
 * HỐ XANH — bộ kiểm.
 *
 * Chạy:  node test/ho-xanh-suite.js
 * Ảnh chụp ra thư mục SHOTS (mặc định %TEMP%/ho-xanh-shots) — mở ra xem bằng mắt.
 * Chạy ở 1280×720 và 844×390, lộ trình cố định A01 → B01 → C03 (?route=) để kỳ vọng viết cứng được.
 * Vòng một ngày (prep → cano → lặn → về quán → bếp → quán → sổ → ngày 2) chạy riêng ở loop().
 * Hàm thuần của data/meta.js kiểm ở test/ho-xanh-meta.js.
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
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css' };
// Ba tệp dữ liệu do luồng bóc asset ghi ra. Chưa có trên đĩa thì 404 của chúng không tính là lỗi; có rồi thì 404 là lỗi thật.
const OPTIONAL = ['data/gear_sheet.js', 'data/bar_assets.js', 'data/boat_assets.js']
  .filter(f => !fs.existsSync(path.join(ROOT, 'games/ho-xanh', f))).map(f => '/games/ho-xanh/' + f);
const optional = url => OPTIONAL.some(f => url.split('?')[0].endsWith(f));

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

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !optional(m.location().url || '')) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !optional(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// Từ màn đầu hoặc chuẩn bị: bấm Ra khơi, bỏ qua cano, chờ tới lúc lặn.
async function setSail(page) {
  await page.click('#prep-go');
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
}
// Lặn thêm một lượt mà không đi hết vòng trên bờ: nhảy thẳng tới cano ra khơi.
async function diveAgain(page) {
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'out' }));
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
}
// Bơi thẳng lên mặt nước từ chỗ trống gần mặt nước.
async function swimUp(page) {
  const up = await page.evaluate(() => {
    const W = HX.game.world, sy = HX_TUNING.water.surfaceY;
    for (let x = -30; x < 30; x += 0.7) if (W.open(x, sy - 1.6, 0.5) && !W.raycast(x, sy - 1.6, x, sy)) return { x, y: sy - 1.6 };
    return null;
  });
  await page.evaluate(s => HX_DEBUG.teleport(s.x, s.y), up);
  await page.keyboard.down('KeyW');
  const ok = await page.waitForFunction(() => HX_DEBUG.info().phase === 'result', null, { timeout: 8000 }).then(() => true, () => false);
  await page.keyboard.up('KeyW');
  return ok;
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const info = () => page.evaluate(() => HX_DEBUG.info());
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });

  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  check('màn đầu hiện tên game', (await page.textContent('#title h1')) === 'Hố Xanh');
  await sleep(400);
  await shot('1-title');

  await page.click('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
  await setSail(page);
  let I = await info();
  check('ghép đúng lộ trình A01 → B01 → C03', I.route.join(',') === 'A01,B01,C03', I.route.join(','));
  check('glb A01 nạp đủ 26 lưới đã gộp (gltfpack)', I.glbMeshes === 26, String(I.glbMeshes));
  const roles = I.layers[0].roles;
  check('A01 có đá, san hô 3D, hải quỳ, rong và san hô 2D gốc', ['rock', 'coral3d', 'anemone', 'waveweed', 'sprites'].every(r => roles[r] > 0), JSON.stringify(roles));
  check('Dave bắt đầu bằng pha nhảy xuống nước', I.dave.state === 'enter', I.dave.state);
  // Chỗ thả gốc ở sát vách trái (x=−57); camera từng bị chặn ở x=−43,7 nên Dave rơi ra ngoài màn hình.
  const ds = await page.evaluate(() => { const d = HX_DEBUG.info().dave; return HX_DEBUG.worldToScreen(d.x, d.y); });
  check('vừa xuống nước đã thấy Dave trong khung hình', ds.x > 0 && ds.x < W && ds.y > 0 && ds.y < H, Math.round(ds.x) + ',' + Math.round(ds.y));
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
  const walls = await page.evaluate(() => HX_ZONES.A01.walls);
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

  // Cá bơi sang phải thì đầu cũng ở bên phải (bản cũ lật ngược, cá bơi giật lùi).
  const heading = await page.evaluate(() => {
    const d = HX.game.diver, uid = HX_DEBUG.spawnFish('Titan_Triggerfish', d.pos.x + 3, d.pos.y + 1.5);
    const f = HX.game.fishes.list.find(q => q.id === uid);
    f.frozen = true; f.facing = f.flip = 1; f.update(0.016); f.mesh.update(0.016);
    f.root.updateMatrixWorld(true);
    const sk = f.mesh.skeleton, v = new THREE.Vector3();
    const wx = n => { const b = sk.findBone(n); v.set(b.worldX, b.worldY, 0); f.mesh.localToWorld(v); return v.x; };
    const r = { head: wx('Head'), tail: wx('Tail3') };
    HX_DEBUG.clearFish();
    return r;
  });
  check('cá bò titan hướng sang phải thì đầu nằm bên phải đuôi', heading.head > heading.tail, JSON.stringify(heading));

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
    const minY = await page.evaluate(() => HX_ZONES.A01.bounds.minY);
    const want = Math.round((I.surfaceY - I.dave.y) / (I.surfaceY - minY) * 50);
    check('độ sâu hiển thị theo dải 0–50 m của vùng nông', (await page.textContent('#depth')) === want + ' m', await page.textContent('#depth') + ' / ' + want);
    await shot('6-dive-deep');
  }

  // Tầng giữa và vực sâu nạp ngầm; xuống tới nơi thì có băng tên vùng, độ sâu đúng dải, vực sâu bật đèn đội đầu.
  const allLoaded = await page.waitForFunction(() => HX_DEBUG.info().layers.filter(Boolean).length === 3, null, { timeout: 60000 }).then(() => true, () => false);
  check('nạp ngầm xong cả ba tầng', allLoaded);
  const into = async d0 => {
    const s = await page.evaluate(d0 => {
      const G = HX.game, W = G.world, L = G.stack.layers.find(l => l.d0 === d0);
      for (let y = L.yTop - 20; y > L.yBot + 5; y -= 0.7) for (let x = -40; x < 40; x += 0.9) if (W.open(x, y, 1.5)) return { x, y };
      return null;
    }, d0);
    await page.evaluate(p => HX_DEBUG.teleport(p.x, p.y), s);
    await sleep(900);
    return { J: await info(), m: parseInt(await page.textContent('#depth'), 10), banner: await page.textContent('#area-t') };
  };
  let Z = await into(50);
  check('xuống tầng giữa: vùng B, độ sâu trong 50–130 m, băng "Tầng giữa"', Z.J.area === 'B' && Z.m >= 50 && Z.m <= 130 && Z.banner === 'Tầng giữa', Z.J.area + ' ' + Z.m + ' ' + Z.banner);
  await shot('6b-zone-b');
  Z = await into(130);
  const lamp = await page.evaluate(() => HX.gfx.water.uLamp.value);
  check('xuống vực sâu: vùng C, độ sâu trong 130–250 m, băng "Vực sâu"', Z.J.area === 'C' && Z.m >= 130 && Z.m <= 250 && Z.banner === 'Vực sâu', Z.J.area + ' ' + Z.m + ' ' + Z.banner);
  check('vực sâu bật đèn đội đầu', lamp > 0.9, String(lamp));
  await shot('6c-zone-c');

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
  await diveAgain(page);
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 });
  check('lượt mới bắt đầu với túi cá trống', (await info()).catches.length === 0);
  await page.evaluate(() => HX_DEBUG.giveCatch('Bluetang'));
  const surfaced = await swimUp(page);
  check('bơi lên tới mặt nước thì kết thúc lượt', surfaced);
  await sleep(600);
  const res = await page.evaluate(() => ({
    title: document.getElementById('r-title').textContent, outcome: HX_DEBUG.info().outcome,
    ids: [...document.querySelectorAll('#r-grid .r-fish')].map(e => e.dataset.id),
  }));
  check('màn kết quả khi lên bờ: "Lên bờ rồi!" và giữ cả túi', res.title === 'Lên bờ rồi!' && res.outcome === 'surface' && JSON.stringify(res.ids) === '["Bluetang"]', JSON.stringify(res));
  await shot('8-result-surface');

  // Khoang cứu hộ ở tầng giữa: đứng cạnh thì không sao, bơi lên vào khoang thì lên thuyền với cả túi cá.
  await diveAgain(page);
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 });
  const pod = await page.evaluate(() => { const L = HX.game.stack.layers[1], p = L.zone.pods[0]; return { x: p[0], y: p[1] + L.yOff }; });
  await page.evaluate(() => HX_DEBUG.giveCatch('Coral_Trout'));
  await page.evaluate(p => HX_DEBUG.teleport(p.x, p.y + 0.6), pod);
  await sleep(600);
  check('đứng cạnh khoang mà không bơi lên thì lượt lặn vẫn tiếp tục', (await info()).phase === 'dive');
  check('cạnh khoang hiện lời nhắc bơi lên', await page.evaluate(() => document.getElementById('pod-hint').classList.contains('show')));
  await page.keyboard.down('KeyW');
  const podded = await page.waitForFunction(() => HX_DEBUG.info().phase === 'result', null, { timeout: 4000 }).then(() => true, () => false);
  await page.keyboard.up('KeyW');
  I = await info();
  check('bơi lên vào khoang cứu hộ thì lên thuyền, giữ cả túi', podded && I.outcome === 'pod' && JSON.stringify(I.kept) === '["Coral_Trout"]', I.outcome + ' ' + JSON.stringify(I.kept));
  await shot('9-result-pod');

  check('không có lỗi trang, lỗi console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

// Một ngày trọn vòng trên sổ mới: chuẩn bị → cano → lặn → về quán → bếp → quán → sổ cuối ngày → ngày 2, rồi tải lại trang.
async function loop(browser, base, W, H) {
  const tag = 'day-' + W + 'x' + H;
  out.push('\n[một ngày ' + W + '×' + H + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const info = () => page.evaluate(() => HX_DEBUG.info());
  const save = () => page.evaluate(() => HX_DEBUG.save());
  const phase = p => page.waitForFunction(p => HX_DEBUG.info().phase === p, p, { timeout: 90000 });
  const text = sel => page.textContent(sel);
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const url = base + '/games/ho-xanh/index.html?route=A01,B01,C03';

  await page.goto(url + '&fresh=1');
  await phase('title');
  check('?fresh=1 tự gỡ khỏi địa chỉ sau khi xoá sổ', !page.url().includes('fresh'), page.url());
  let S = await save();
  check('sổ mới: ngày 1, 0 vàng, chưa nâng gì, tủ trống', S.day === 1 && S.gold === 0 && S.stage === 'prep' && S.gear.o2 === 0 && !Object.keys(S.fridge).length, JSON.stringify(S));
  check('nút màn đầu là "Bắt đầu"', (await text('#start')) === 'Bắt đầu', await text('#start'));
  await page.click('#start');
  await phase('prep');
  check('sổ mới bấm Bắt đầu thì vào chuẩn bị, hiện 0 vàng', (await text('.pr-gold')) === '0 vàng', await text('.pr-gold'));
  await shot('1-prep');

  await page.click('.pr-row[data-key="o2"] .pr-buy');
  S = await save();
  check('0 vàng mua O₂ bị từ chối: báo thiếu tiền, sổ không đổi', (await text('.pr-msg')).includes('thiếu tiền') && S.gear.o2 === 0 && S.gold === 0, await text('.pr-msg'));
  await page.click('.pr-tab[data-tab="guns"]');
  check('thẻ Súng liệt kê 5 khẩu', (await page.$$('.pr-row')).length === 5);
  await shot('1b-prep-guns');
  await page.click('.pr-tab[data-tab="bar"]');
  check('thẻ Quán liệt kê ghế, đầu bếp, trang trí, trà', JSON.stringify(await page.$$eval('.pr-row', r => r.map(e => e.dataset.key))) === '["seats","chef","decor","tea"]');

  await page.click('#prep-go');
  await phase('boat');
  check('Ra khơi thì lên cano ra Hố Xanh', (await text('#scr-boat h2')).includes('ra Hố Xanh'), await text('#scr-boat h2'));
  await shot('2-boat-out');
  await phase('dive');
  let I = await info();
  check('cano tự chạy xong thì vào lặn với trang bị cấp 0 (O₂ 100, túi 8, đồ lặn 130 m)',
    I.loadout.o2 === 100 && I.loadout.cargo === 8 && I.loadout.suit === 130 && I.dave.o2 === 100, JSON.stringify(I.loadout));
  check('HUD túi cá hiện 0/8', (await text('#catch-n')) === '0/8', await text('#catch-n'));
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 });
  await page.evaluate(() => HX_DEBUG.giveCatch('Coral_Trout'));
  check('bơi lên mặt nước thì hết lượt', await swimUp(page));
  await sleep(500);
  S = await save();
  check('nút màn kết quả là "Về quán"', (await text('#r-again')) === 'Về quán', await text('#r-again'));
  check('hết lượt là cá đã vào tủ, sổ chờ bán (stage bar), có trong sách cá', S.fridge.Coral_Trout === 1 && S.stage === 'bar' && S.dex.Coral_Trout === 1, JSON.stringify(S.fridge) + ' ' + S.stage);
  await shot('3-result');

  await page.click('#r-again');
  await phase('boat');
  check('Về quán thì cano chạy về', (await text('#scr-boat h2')).includes('về quán'), await text('#scr-boat h2'));
  check('rời mặt nước thì dỡ lượt lặn (không còn lộ trình)', (await info()).route.length === 0);
  await page.click('#boat-skip');
  await phase('kitchen');
  await sleep(300);
  const dish = await page.$eval('.br-row[data-id="Coral_Trout"] b', e => e.textContent).catch(() => null);
  check('bếp bày món từ con cá vừa mang về', dish === 'Sushi cá mú chấm', dish);
  await shot('4-kitchen');

  await page.click('#kitchen-open');
  await phase('bar');
  const sold = await page.waitForFunction(() => /^[1-9]/.test(document.querySelector('#scr-bar .br-note').textContent), null, { timeout: 5000 }).then(() => true, () => false);
  check('quán tự bán được ít nhất một suất', sold, await text('#scr-bar .br-note'));
  await shot('5-bar');
  await page.click('#bar-close');
  await phase('ledger');
  const earned = +(await page.$eval('.br-ledger', e => e.dataset.earned));
  S = await save();
  check('sổ cuối ngày: thu > 0, cộng đúng vào vàng, sang ngày 2, về stage prep', earned > 0 && S.gold === earned && S.day === 2 && S.stage === 'prep', earned + ' / ' + JSON.stringify({ gold: S.gold, day: S.day, stage: S.stage }));
  check('bán rồi thì con cá rời tủ', !S.fridge.Coral_Trout, JSON.stringify(S.fridge));
  await shot('6-ledger');
  await page.click('#ledger-next');
  await phase('prep');
  check('sang ngày 2 ở màn chuẩn bị', (await text('.pr-head h2')) === 'Ngày 2' && (await text('.pr-gold')) === earned + ' vàng', await text('.pr-head h2') + ' ' + await text('.pr-gold'));

  // Tải lại trang: sổ còn nguyên. Cho thêm vàng để thử nâng O₂.
  await page.evaluate(() => HX_DEBUG.grant(1000));
  await page.goto('about:blank');
  await page.goto(url);
  await phase('title');
  S = await save();
  check('tải lại trang: sổ vẫn ngày 2 với số vàng cũ', S.day === 2 && S.gold === earned + 1000, JSON.stringify({ day: S.day, gold: S.gold }));
  check('nút màn đầu thành "Tiếp tục · ngày 2"', (await text('#start')) === 'Tiếp tục · ngày 2', await text('#start'));
  await page.click('#start');
  await phase('prep');
  await page.click('.pr-row[data-key="o2"] .pr-buy');
  S = await save();
  check('đủ tiền thì nâng được O₂ lên cấp 1, trừ 300 vàng', S.gear.o2 === 1 && S.gold === earned + 700, JSON.stringify({ o2: S.gear.o2, gold: S.gold }));
  await setSail(page);
  I = await info();
  check('lượt lặn sau có O₂ tối đa 120', I.loadout.o2 === 120 && Math.round(I.dave.o2) === 120 && (await text('#o2-num')) === '120', I.loadout.o2 + ' ' + I.dave.o2 + ' ' + await text('#o2-num'));

  // Túi đầy: 9 con cá hề tới tay Dave, chỉ 8 con vào túi.
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 });
  const cargo = await page.evaluate(() => {
    const G = HX.game, d = G.diver;
    HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish();
    const ids = [];
    for (let i = 0; i < 9; i++) ids.push(HX_DEBUG.spawnFish('ClownFish', d.pos.x + 1 + i * 0.3, d.pos.y, true));
    G.fishes.list.filter(f => ids.includes(f.id)).forEach(f => G.catchFish(f));
    // HUD cập nhật ở khung hình kế tiếp
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res({ n: G.catches.length,
      hud: document.getElementById('catch-n').textContent, full: document.getElementById('catch').classList.contains('full'), toast: document.getElementById('toast').textContent }))));
  });
  check('túi 8 con: con thứ 9 bị thả, HUD 8/8 đỏ, báo "Túi đầy"', cargo.n === 8 && cargo.hud === '8/8' && cargo.full && cargo.toast.startsWith('Túi đầy'), JSON.stringify(cargo));
  await sleep(300);
  await shot('7-cargo-full');

  // Quá 130 m (đồ lặn cấp 0): HUD cảnh báo, dưỡng khí tụt ×2,5.
  const loaded = await page.waitForFunction(() => HX_DEBUG.info().layers.filter(Boolean).length === 3, null, { timeout: 60000 }).then(() => true, () => false);
  if (loaded) {
    const deep = await page.evaluate(() => {
      const G = HX.game, W = G.world, L = G.stack.layers.find(l => l.d0 === 130);
      for (let y = L.yTop - 20; y > L.yBot + 5; y -= 0.7) for (let x = -40; x < 40; x += 0.9) if (W.open(x, y, 1.5)) return { x, y };
      return null;
    });
    await page.evaluate(p => { HX_DEBUG.teleport(p.x, p.y); HX_DEBUG.setO2(100); }, deep);
    await sleep(300);
    const r = await page.evaluate(async () => {
      const G = HX.game, T = HX_TUNING, o0 = G.diver.o2, t0 = G.t;
      await new Promise(res => setTimeout(res, 1000));
      const dt = G.t - t0, depth = G.stack.depth(G.diver.pos.y);
      return { depth, drop: (o0 - G.diver.o2) / dt, normal: T.o2.drain + depth * T.o2.drainPerMeter,
        warn: getComputedStyle(document.getElementById('suit-warn')).display !== 'none' };
    });
    check('xuống quá 130 m: hiện cảnh báo đồ lặn, dưỡng khí tụt ~×2,5', r.depth > 130 && r.warn && r.drop > r.normal * 2 && r.drop < r.normal * 3,
      'sâu ' + Math.round(r.depth) + ' m, tụt ' + r.drop.toFixed(2) + '/s, thường ' + r.normal.toFixed(2) + '/s');
    await shot('8-too-deep');
  } else check('nạp ngầm xong cả ba tầng để thử đồ lặn', false);

  // ?fresh=1 xoá sổ.
  await page.goto('about:blank');
  await page.goto(url + '&fresh=1');
  await phase('title');
  S = await save();
  check('?fresh=1 xoá sổ: về ngày 1, 0 vàng, O₂ cấp 0', S.day === 1 && S.gold === 0 && S.gear.o2 === 0, JSON.stringify({ day: S.day, gold: S.gold, o2: S.gear.o2 }));

  // ?phase=bar vào thẳng quán với vài con cá giả trong tủ.
  await page.goto('about:blank');
  await page.goto(base + '/games/ho-xanh/index.html?phase=bar');
  await phase('bar');
  await sleep(1500);
  check('?phase=bar vào thẳng quán, có món để bán', (await page.$$('#scr-bar .br-row')).length >= 1);
  await shot('9-debug-bar');

  check('không có lỗi trang, lỗi console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

// Không ép lộ trình: ba lượt liền nhau, lượt sau luôn khác chủ đề lượt trước, và tầng dưới khớp miệng nối tầng trên.
async function themes(browser, base) {
  out.push('\n[chủ đề]');
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(base + '/games/ho-xanh/index.html');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    if (i === 0) { await page.click('#start'); await setSail(page); } else await diveAgain(page);
    const I = await page.evaluate(() => HX_DEBUG.info());
    const links = await page.evaluate(r => r.slice(1).every((id, k) => HX_ZONES[id].top === HX_ZONES[r[k]].bottom), I.route);
    seen.push(I.theme + ':' + I.route.join('→'));
    check('lượt ' + (i + 1) + ' ghép tầng khớp miệng nối', links, I.route.join('→'));
    await page.evaluate(() => HX_DEBUG.setO2(0));
    await page.waitForFunction(() => HX_DEBUG.info().phase === 'result', null, { timeout: 8000 });
    await sleep(300);
  }
  const th = seen.map(x => x.split(':')[0]);
  check('mỗi lượt đổi sang chủ đề khác lượt trước', th[0] !== th[1] && th[1] !== th[2], seen.join(' | '));
  const top = seen.map(x => x.split(':')[1].split('→')[0]);
  check('mỗi lượt xuống một bản đồ vùng nông khác lượt trước', top[0] !== top[1] && top[1] !== top[2], top.join(' | '));
  await page.close();
}

(async () => {
  // HX_BASE=https://poke5121999-art.github.io/survivor-web-hub để kiểm bản trên Pages.
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  if (OPTIONAL.length) out.push('(chưa có trên đĩa, bỏ qua 404: ' + OPTIONAL.join(', ') + ')');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
    await loop(browser, base, 1280, 720);
    await loop(browser, base, 844, 390);
    await themes(browser, base);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
