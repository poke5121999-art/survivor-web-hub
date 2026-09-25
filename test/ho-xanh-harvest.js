/*
 * HỐ XANH — giằng co với cá lớn và xác cá.
 *
 * Chạy:  node test/ho-xanh-harvest.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-harvest-shots): lúc giằng co, xác cá có lời nhắc, lúc Dave nhặt. Mở ra xem.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-harvest-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml' };

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
  const fishBy = uid => page.evaluate(id => HX_DEBUG.fishAt().find(f => f.uid === id) || null, uid);

  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03&theme=day&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await page.click('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
  await page.click('#prep-go');
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
  await page.evaluate(() => {
    const orig = HX.audio.play; window.__played = [];
    HX.audio.play = function (k, o) { window.__played.push(k); return orig(k, o); };
    const loop = HX.audio.loop;
    HX.audio.loop = function (id, k, v) { window.__played.push('loop:' + k); return loop(id, k, v); };
    HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish();
  });
  const played = () => page.evaluate(() => window.__played.splice(0));
  // Chỗ nước trống, thoáng 7 m bên phải.
  const spot = await page.evaluate(() => {
    const W = HX.game.world;
    for (let y = 12; y > -30; y -= 0.7) for (let x = -40; x < 30; x += 0.9) {
      if (!W.open(x, y, 1.3)) continue;
      let ok = true;
      for (let k = 1; k <= 7 && ok; k++) ok = W.open(x + k, y, 1.2);
      if (ok && !W.raycast(x, y, x + 7, y) && !W.raycast(x, y + 1, x + 7, y + 1) && !W.raycast(x, y - 1, x + 7, y - 1)) return { x, y };
    }
    return null;
  });
  check('tìm được chỗ nước trống thoáng 7 m', !!spot, JSON.stringify(spot));
  if (!spot) { await page.close(); return; }
  const home = async () => {
    await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(s => {
      HX_DEBUG.teleport(s.x, s.y); HX.game.diver.facing = 1; HX_DEBUG.clearFish(); HX.game.catches.length = 0;
      HX_DEBUG.setO2(90); HX.game.diver.invuln = 0;
    }, spot);
  };

  // ---- giằng co: Dave đứng yên, cá chỉ chạy tới hết dây ----
  await home();
  await sleep(300);
  const big = await page.evaluate(s => {
    const uid = HX_DEBUG.spawnFish('Titan_Triggerfish', s.x + 2.4, s.y, true);
    // còn 8/16 máu: trúng một mũi xiên (3) là xuống dưới 60% máu, phải giằng co
    HX.game.fishes.list.find(f => f.id === uid).hp = 8;
    return uid;
  }, spot);
  const tS = await page.evaluate(s => HX_DEBUG.worldToScreen(s.x + 2.4, s.y), spot);
  await page.mouse.move(tS.x, tS.y);
  await page.mouse.down();
  await sleep(380);
  await page.mouse.up();
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'tug', null, { timeout: 2000 }).catch(() => {});
  let I = await info();
  check('xiên trúng cá bò titan còn 8 máu: vào giằng co', I.dave.state === 'tug', I.dave.state);
  const p0 = I.dave;
  const trace = await page.evaluate(async () => {
    const G = HX.game, d = G.diver, x0 = d.pos.x, y0 = d.pos.y, out = { maxMove: 0, maxRope: 0, t: 0 };
    const t0 = G.t;
    while (d.state === 'tug' && G.t - t0 < 3) {
      await new Promise(r => requestAnimationFrame(r));
      const f = G.harpoon.fish;
      out.maxMove = Math.max(out.maxMove, Math.hypot(d.pos.x - x0, d.pos.y - y0));
      if (f) out.maxRope = Math.max(out.maxRope, Math.hypot(f.pos.x - d.pos.x, f.pos.y - d.pos.y));
      out.t = G.t - t0;
    }
    return out;
  });
  check('giằng co ' + trace.t.toFixed(1) + ' giây không bấm: Dave xê dịch < 0,2 m', trace.t > 1.5 && trace.maxMove < 0.2, JSON.stringify(trace));
  check('cá mắc xiên không chạy quá tầm dây 5,5 m', trace.maxRope > 0.5 && trace.maxRope <= 5.5 + 1e-6, trace.maxRope.toFixed(2));
  void p0; void big;

  // ---- giằng co: cá hung dữ không cắn được Dave ----
  await home();
  await sleep(300);
  const big2 = await page.evaluate(s => {
    const uid = HX_DEBUG.spawnFish('Titan_Triggerfish', s.x + 2.4, s.y, true);
    HX.game.fishes.list.find(f => f.id === uid).hp = 8;
    return uid;
  }, spot);
  await page.mouse.move(tS.x, tS.y);
  await page.mouse.down();
  await sleep(380);
  await page.mouse.up();
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'tug', null, { timeout: 2000 }).catch(() => {});
  await played();
  const bite = await page.evaluate(async () => {
    const G = HX.game, d = G.diver;
    const sp = HX.fish.SPECIES.filter(s => s.aggressive && s.damage > 0).sort((a, b) => b.damage - a.damage)[0];
    const f = G.fishes.spawnAt(sp, d.pos.x, d.pos.y);
    f.go('chase');
    const o0 = d.o2, t0 = G.t;
    let minDist = 99, tugT = 0;
    while (G.t - t0 < 1.6) {
      await new Promise(r => requestAnimationFrame(r));
      if (d.state === 'tug') { d.data.gauge = 0.5; d.data.time = 3; tugT = G.t - t0; }
      const c = f.center();
      minDist = Math.min(minDist, Math.hypot(c.x - d.pos.x, c.y - d.pos.y));
    }
    return { sp: sp.id, dmg: sp.damage, o2drop: o0 - d.o2, t: G.t - t0, tugT, minDist, state: d.state };
  });
  const snd = await played();
  check('giằng co: cá hung dữ ' + bite.sp + ' (cắn ' + bite.dmg + ') ở sát Dave 1,6 giây mà O₂ chỉ tụt theo nhịp thở, không tiếng bị cắn',
    bite.tugT > 1.5 && bite.minDist < 1 && bite.o2drop < 1.5 && !snd.some(k => /^dave_hit/.test(k)), JSON.stringify(bite) + ' ' + snd.join(','));
  await shot('1-tug');
  void big2;

  // ---- dao hạ cá: xác nằm lại, không tự vào túi; bơi lại bấm E thì nhặt ----
  await home();
  await sleep(300);
  const kuid = await page.evaluate(s => HX_DEBUG.spawnFish('ClownFish', s.x + 0.4, s.y + 0.05, true), spot);
  await page.keyboard.press('KeyF');
  await sleep(300);
  let K = await fishBy(kuid);
  check('một nhát dao hạ cá hề: cá sang dying (hoạt ảnh die)', K && K.state === 'dying' && K.hp === 0, JSON.stringify(K));
  // đẩy xác ra xa 2 m rồi chờ 2 giây: vẫn còn trong nước, túi vẫn trống
  await page.evaluate(([id, s]) => { const f = HX.game.fishes.list.find(q => q.id === id); f.pos.x = s.x + 2.2; f.pos.y = s.y; }, [kuid, spot]);
  await sleep(2000);
  K = await fishBy(kuid);
  I = await info();
  check('2 giây sau: xác cá hề vẫn nằm trong nước (dead), túi vẫn 0 con', K && K.state === 'dead' && I.catches.length === 0, JSON.stringify(K) + ' túi ' + JSON.stringify(I.catches));
  let prompt = await page.evaluate(() => !document.getElementById('harvest').hidden);
  check('ở xa 2 m thì chưa hiện lời nhắc nhặt', !prompt);
  await page.keyboard.down('KeyD');
  await page.waitForFunction(() => !document.getElementById('harvest').hidden, null, { timeout: 3000 }).catch(() => {});
  await page.keyboard.up('KeyD');
  await sleep(250);
  prompt = await page.evaluate(() => {
    const el = document.getElementById('harvest'), k = document.getElementById('hv-key').getBoundingClientRect();
    return { on: !el.hidden, carve: el.classList.contains('carve'), key: k.width > 10 && k.height > 5, x: k.x, y: k.y };
  });
  check('bơi tới sát xác: hiện phím Space gốc phía trên con cá (nhặt, không vòng xả)', prompt.on && !prompt.carve && prompt.key, JSON.stringify(prompt));
  await shot('2-corpse-prompt');
  await played();
  await page.keyboard.press('KeyE');
  await sleep(60);
  I = await info();
  check('bấm E: Dave vào harvest, chạy clip PickUp', I.dave.state === 'harvest' && I.dave.anim === 'PickUp', I.dave.state + ' ' + I.dave.anim);
  await shot('3-pickup');
  await sleep(500);
  I = await info();
  const snd2 = await played();
  check('nhặt xong: túi +1 (cá hề), Dave về bơi, tiếng nhặt gốc', JSON.stringify(I.catches) === '["ClownFish"]' && I.dave.state === 'swim' && snd2.includes('dave_grab'),
    JSON.stringify(I.catches) + ' ' + I.dave.state + ' ' + snd2.join(','));
  K = await fishBy(kuid);
  check('xác đã nhặt thì rời khỏi nước', !K, JSON.stringify(K));

  // ---- cá lớn (cá khế vây vàng, CarvableCount 2): giữ E 2,2 giây để xả thịt ----
  await home();
  await sleep(300);
  const guid = await page.evaluate(s => {
    const uid = HX_DEBUG.spawnFish('Giant_Trevally', s.x + 1.2, s.y, true);
    const f = HX.game.fishes.list.find(q => q.id === uid);
    f.damage(999, s.x, s.y, false);
    return uid;
  }, spot);
  await page.waitForFunction(id => (HX_DEBUG.fishAt().find(f => f.uid === id) || {}).state === 'dead', guid, { timeout: 5000 }).catch(() => {});
  // Dave áp sát thân cá
  await page.evaluate(id => {
    const G = HX.game, f = G.fishes.list.find(q => q.id === id), c = f.center();
    HX_DEBUG.teleport(c.x - f.hw - 0.2, c.y);
  }, guid);
  await sleep(200);
  prompt = await page.evaluate(() => ({ on: !document.getElementById('harvest').hidden, carve: document.getElementById('harvest').classList.contains('carve') }));
  check('cạnh xác cá khế vây vàng: lời nhắc có vòng xả thịt', prompt.on && prompt.carve, JSON.stringify(prompt));
  await played();
  await page.keyboard.down('KeyE');
  await sleep(1000);
  I = await info();
  const mid = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('hv-bar')).getPropertyValue('--k')));
  const sndC = await played();
  check('giữ E 1 giây: Dave xả thịt (clip Tanning, tiếng Carving gốc lặp), vòng đầy ~45%, cá chưa vào túi',
    I.dave.state === 'harvest' && I.dave.anim === 'Tanning' && sndC.includes('loop:carving') && mid > 120 && mid < 210 && I.catches.length === 0,
    I.dave.state + ' ' + I.dave.anim + ' vòng ' + mid + '° túi ' + I.catches.length + ' ' + sndC.join(','));
  await shot('4-carve');
  await page.keyboard.up('KeyE');
  await sleep(100);
  I = await info();
  check('thả E giữa chừng: thôi xả, xác vẫn còn', I.dave.state === 'swim' && I.catches.length === 0 && (await fishBy(guid)).state === 'dead', I.dave.state + ' ' + I.catches.length);
  await page.keyboard.down('KeyE');
  await sleep(2500);
  I = await info();
  check('giữ E đủ 2,2 giây: cá khế vây vàng vào túi, Dave giơ ngón cái (TanningAfter)',
    JSON.stringify(I.catches) === '["Giant_Trevally"]' && I.dave.anim === 'TanningAfter', JSON.stringify(I.catches) + ' ' + I.dave.state + ' ' + I.dave.anim);
  await page.keyboard.up('KeyE');

  // ---- túi đầy: Overloaded, xác vẫn nằm đó ----
  await home();
  await sleep(200);
  const fuid = await page.evaluate(s => {
    const G = HX.game; while (G.catches.length < G.loadout.cargo) G.catches.push('ClownFish');
    const uid = HX_DEBUG.spawnFish('ClownFish', s.x + 0.35, s.y, true);
    G.fishes.list.find(q => q.id === uid).damage(99, s.x, s.y, false);
    return uid;
  }, spot);
  await sleep(200);
  await page.keyboard.press('KeyE');
  await sleep(80);
  I = await info();
  const toast = await page.textContent('#toast');
  check('túi đầy: bấm E thì Dave nhún vai (Overloaded), báo "Túi đầy", xác vẫn còn', I.dave.anim === 'Overloaded' && /Túi đầy/.test(toast) && I.catches.length === I.loadout.cargo && (await fishBy(fuid)) && (await fishBy(fuid)).hp === 0,
    I.dave.anim + ' "' + toast + '" ' + I.catches.length);
  await sleep(500);

  // ---- cảm ứng: nút Nhặt chỉ hiện khi cạnh xác cá, bấm là nhặt ----
  await page.evaluate(() => document.body.classList.add('touch'));
  await home();
  await sleep(200);
  const grabVis = () => page.evaluate(() => getComputedStyle(document.getElementById('tb-grab')).display !== 'none');
  const noCorpse = await grabVis();
  await page.evaluate(s => {
    const uid = HX_DEBUG.spawnFish('ClownFish', s.x + 0.35, s.y, true);
    HX.game.fishes.list.find(q => q.id === uid).damage(99, s.x, s.y, false);
  }, spot);
  await sleep(200);
  const near = await grabVis();
  const bb = await (await page.$('#tb-grab')).boundingBox();
  if (bb) { await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await sleep(80); await page.mouse.up(); }
  await sleep(500);
  I = await info();
  check('cảm ứng: nút Nhặt ẩn khi không có xác, hiện cạnh xác, bấm là nhặt vào túi', !noCorpse && near && JSON.stringify(I.catches) === '["ClownFish"]',
    'không xác ' + noCorpse + ', cạnh xác ' + near + ', túi ' + JSON.stringify(I.catches));
  await page.evaluate(() => document.body.classList.remove('touch'));

  check('không có lỗi trang, lỗi console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
