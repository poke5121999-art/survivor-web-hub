/*
 * HỐ XANH — HUD cảm ứng lúc lặn theo bản Android (InGameTouchCanvas, data/mobile_ui.js).
 *
 * Chạy:  node test/ho-xanh-touch.js
 * Điện thoại ngang giả lập (hasTouch, isMobile) ở 844×390 và 740×360; ngón tay gửi qua CDP Input.dispatchTouchEvent.
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-touch-shots): HUD lúc bơi, lúc ngắm, lúc kéo vào ô huỷ, lúc giằng co.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-touch-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };

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
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function run(browser, base, W, H) {
  const tag = W + 'x' + H, u = W / 2340;  // 1 đơn vị canvas gốc
  out.push('\n[' + tag + ' cảm ứng]');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const info = () => page.evaluate(() => HX_DEBUG.info());
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const fishBy = uid => page.evaluate(id => HX_DEBUG.fishAt().find(f => f.uid === id) || null, uid);
  // ngón tay: CDP gửi danh sách mọi ngón đang chạm; nhấc một ngón = touchEnd với các ngón còn lại
  const fingers = new Map();
  const pts = () => [...fingers].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  const down = (x, y, id = 1) => { fingers.set(id, { x, y }); return cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts() }); };
  const move = (x, y, id = 1) => { fingers.set(id, { x, y }); return cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts() }); };
  const up = (id = 1) => { fingers.delete(id); return cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts() }); };
  const box = id => page.evaluate(i => { const r = document.getElementById(i).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, shown: r.width > 0 && getComputedStyle(document.getElementById(i)).display !== 'none' }; }, id);
  const tap = async (id, f = 2) => { const b = await box(id); await down(b.x, b.y, f); await sleep(60); await up(f); await sleep(60); return b; };

  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03&theme=day&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await page.evaluate(() => HX.save.commit(s => HX_META.buyGun(s, 'rifle').save));
  await page.tap('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
  await page.tap('#prep-go');
  await page.tap('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
  check('điện thoại cảm ứng: body có lớp touch, HUD cảm ứng hiện', await page.evaluate(() => document.body.classList.contains('touch') && getComputedStyle(document.getElementById('tc')).display === 'block'));
  await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); });

  // ---- bố cục: tâm và cỡ nút lấy từ RectTransform gốc (canvas 2340×1080, khớp bề ngang) ----
  const want = { 'tb-fire': [396, 196, 240], 'tb-knife': [396, 470, 208], 'tb-boost': [180, 288, 160], 'tb-dash': [180, 470, 160], 'tb-switch': [284, 84, 120] };
  for (const id of Object.keys(want)) {
    const [dx, dy, s] = want[id], b = await box(id);
    check(id + ': tâm cách phải ' + dx + ', cách đáy ' + dy + ', cỡ ' + s + ' đơn vị gốc',
      b.shown && near(b.x, W - dx * u, 1.5) && near(b.y, H - dy * u, 1.5) && near(b.w, s * u, 1.5),
      'tâm (' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ') cần (' + (W - dx * u).toFixed(1) + ',' + (H - dy * u).toFixed(1) + '), cỡ ' + b.w.toFixed(1) + ' cần ' + (s * u).toFixed(1));
  }
  const menu = await box('btn-pause');
  check('nút menu 菜单 ở góc phải trên: tâm cách phải 144, cách đỉnh 84, cỡ 88', near(menu.x, W - 144 * u, 1.5) && near(menu.y, 84 * u, 1.5) && near(menu.w, 88 * u, 1.5), JSON.stringify(menu));
  const o2 = await page.evaluate(() => document.getElementById('o2box').getBoundingClientRect().toJSON());
  check('đồng hồ O₂ sang góc phải trên như bản Android (mép phải cách 320 đơn vị)', near(o2.right, W - 320 * u, 1.5) && o2.top < 20, JSON.stringify(o2));
  check('không xác cá thì nút tương tác 交互 ẩn; không ngắm thì ô Huỷ bắn ẩn; cần trái ẩn khi chưa chạm',
    !(await box('tb-grab')).shown && !(await box('tb-cancel')).shown && !(await box('stick')).shown);
  await shot('hud');

  const spot = await page.evaluate(() => {
    const Wd = HX.game.world;
    for (let y = 12; y > -30; y -= 0.7) for (let x = -40; x < 30; x += 0.9) {
      if (!Wd.open(x, y, 1.3)) continue;
      let ok = true;
      for (let k = 1; k <= 8 && ok; k++) ok = Wd.open(x + k, y, 1.2);
      if (ok && !Wd.raycast(x, y, x + 8, y) && !Wd.raycast(x, y + 1, x + 8, y + 1) && !Wd.raycast(x, y - 1, x + 8, y - 1)) return { x, y };
    }
    return null;
  });
  check('tìm được chỗ nước trống thoáng 8 m', !!spot, JSON.stringify(spot));
  if (!spot) { await ctx.close(); return; }
  const home = async () => {
    await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(s => {
      HX_DEBUG.teleport(s.x, s.y); HX.game.diver.facing = 1; HX_DEBUG.clearFish(); HX.game.catches.length = 0;
      HX_DEBUG.setO2(90); HX.game.diver.invuln = 0;
    }, spot);
    await sleep(250);
  };

  // ---- bơi bằng cần trái nổi ----
  await home();
  const x0 = (await info()).dave.x;
  const sx = 120 * W / 844, sy = H - 90;
  await down(sx, sy);
  await sleep(50);
  const stickAt = await box('stick');
  await move(sx + 100, sy);
  await sleep(700);
  await shot('stick');
  const knob = await box('stick-knob');
  let I = await info();
  await up();
  await sleep(80);
  check('chạm góc dưới trái: cần hiện đúng chỗ ngón cái (cần nổi), đáy 320 đơn vị', stickAt.shown && near(stickAt.x, sx, 1) && near(stickAt.y, sy, 1) && near(stickAt.w, 320 * u, 1.5), JSON.stringify(stickAt));
  check('kéo 100 px sang phải: núm dừng ở tầm 150 đơn vị', near(knob.x - sx, 150 * u, 1.5) && near(knob.y, sy, 1), (knob.x - sx).toFixed(1) + ' px, cần ' + (150 * u).toFixed(1));
  check('kéo cần sang phải 0,7 giây: Dave bơi sang phải hơn 1 m', I.dave.x - x0 > 1, (I.dave.x - x0).toFixed(2) + ' m');
  check('thả tay: cần ẩn', !(await box('stick')).shown);

  // ---- xiên: giữ nút bắn, kéo sang phải để ngắm, thả là bắn ----
  await home();
  const fire = await box('tb-fire');
  await down(fire.x, fire.y);
  await sleep(60);
  await move(fire.x + 60, fire.y);
  await sleep(380);
  // đặt cá hề đúng đường bay: cách mũi xiên 2,5 m theo góc đang ngắm
  const clown = await page.evaluate(() => {
    const d = HX.game.diver, t = d.gunTip(), a = d.aimAngle;
    return HX_DEBUG.spawnFish('ClownFish', t.x + Math.cos(a) * 2.5, t.y + Math.sin(a) * 2.5 - 0.015, true);
  });
  await sleep(60);
  I = await info();
  const aimUi = await page.evaluate(() => ({ aiming: document.getElementById('tc').classList.contains('aiming'), cancel: getComputedStyle(document.getElementById('tb-cancel')).display, ang: HX.game.diver.aimAngle }));
  await shot('aim');
  check('giữ nút bắn: Dave rút xiên (aim), hiện đáy ngắm và ô Huỷ bắn', I.dave.state === 'aim' && aimUi.aiming && aimUi.cancel === 'block', I.dave.state + ' ' + JSON.stringify(aimUi));
  check('kéo sang phải: góc ngắm gần 0 (sang phải)', Math.abs(aimUi.ang) < 0.25, aimUi.ang.toFixed(3));
  await up();
  await page.waitForFunction(() => HX_DEBUG.info().catches.length === 1, null, { timeout: 5000 }).catch(() => {});
  I = await info();
  check('thả tay: bắn xiên trúng cá hề, kéo về túi', JSON.stringify(I.catches) === '["ClownFish"]', JSON.stringify(I.catches) + ' ' + JSON.stringify(await fishBy(clown)));

  // ---- kéo vào ô Huỷ bắn rồi thả: không bắn ----
  await home();
  await down(fire.x, fire.y);
  await sleep(400);
  const cb = await box('tb-cancel');
  await move(fire.x - 20, fire.y - 60);
  await move(cb.x, cb.y);
  await sleep(80);
  const over = await page.evaluate(() => document.getElementById('tc').classList.contains('over'));
  await shot('cancel');
  await up();
  await sleep(150);
  I = await info();
  check('kéo vào ô Huỷ bắn: HUD chuyển bản đỏ; thả ra: Dave về bơi, xiên vẫn trong súng', over && I.dave.state === 'swim' && I.harpoon === 'ready', 'đỏ ' + over + ', ' + I.dave.state + ', xiên ' + I.harpoon);

  // ---- giằng co: nút HarpoonQTE hiện trên nút bắn, chạm liên tục thì thắng ----
  await home();
  await page.evaluate(s => { const id = HX_DEBUG.spawnFish('Titan_Triggerfish', s.x + 2.4, s.y, true); HX.game.fishes.list.find(f => f.id === id).hp = 8; }, spot);
  await down(fire.x, fire.y);
  await sleep(60);
  await move(fire.x + 60, fire.y);
  await sleep(380);
  await up();
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'tug', null, { timeout: 2000 }).catch(() => {});
  I = await info();
  check('xiên trúng cá bò titan còn 8 máu: vào giằng co', I.dave.state === 'tug', I.dave.state);
  const qte = await box('tb-qte');
  const fireHid = await page.evaluate(() => getComputedStyle(document.getElementById('tb-fire')).visibility === 'hidden');
  check('giằng co: nút HarpoonQTE hiện thay chỗ nút bắn (tâm trùng, nút bắn ẩn)', qte.shown && near(qte.x, fire.x, 1) && near(qte.y, fire.y, 1) && fireHid, JSON.stringify(qte) + ' ẩn nút bắn ' + fireHid);
  await shot('tug');
  for (let i = 0; i < 40 && (await info()).dave.state === 'tug'; i++) { await down(qte.x, qte.y); await sleep(35); await up(); await sleep(35); }
  await page.waitForFunction(() => HX_DEBUG.info().catches.length === 1, null, { timeout: 5000 }).catch(() => {});
  I = await info();
  check('chạm liên tục nút giằng co: thắng, cá bò titan vào túi', JSON.stringify(I.catches) === '["Titan_Triggerfish"]', I.dave.state + ' ' + JSON.stringify(I.catches));
  check('hết giằng co: nút HarpoonQTE ẩn', !(await box('tb-qte')).shown);

  // ---- dao rồi nhặt xác bằng nút 交互 ----
  await home();
  const c2 = await page.evaluate(s => HX_DEBUG.spawnFish('ClownFish', s.x + 0.6, s.y + 0.05, true), spot);
  await tap('tb-knife');
  await page.waitForFunction(id => { const f = HX_DEBUG.fishAt().find(q => q.uid === id); return f && f.hp <= 0; }, c2, { timeout: 2000 }).catch(() => {});
  const cf = await fishBy(c2);
  check('nút dao: một nhát hạ cá hề', cf && cf.hp <= 0, JSON.stringify(cf));
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 2000 }).catch(() => {});
  await sleep(200);
  const grab = await box('tb-grab');
  check('cạnh xác cá: nút tương tác 交互 hiện ở chỗ gốc (cách phải 610, cách đáy 350)', grab.shown && near(grab.x, W - 610 * u, 1.5) && near(grab.y, H - 350 * u, 1.5), JSON.stringify(grab));
  await tap('tb-grab');
  await page.waitForFunction(() => HX_DEBUG.info().catches.length === 1, null, { timeout: 3000 }).catch(() => {});
  I = await info();
  check('chạm 交互: nhặt xác cá hề vào túi', JSON.stringify(I.catches) === '["ClownFish"]', JSON.stringify(I.catches));

  // ---- súng phụ: nút nhỏ đổi vũ khí, nút lớn giữ rồi thả (không kéo = tự nhắm con gần nhất) ----
  await home();
  const tf = await page.evaluate(s => HX_DEBUG.spawnFish('Titan_Triggerfish', s.x + 2.2, s.y + 0.8, true), spot);
  await tap('tb-switch');
  await sleep(100);
  const face = await page.evaluate(() => ({ icon: document.getElementById('tb-fire-icon').src, ammo: document.getElementById('tb-fire-ammo').textContent, sub: document.getElementById('tb-sub-icon').src }));
  check('chạm nút đổi: nút bắn hiện súng trường (Item_BasicRifle) và 8/8 viên, nút nhỏ hiện xiên', /Item_BasicRifle\.png/.test(face.icon) && face.ammo === '8/8' && /icon_harpoon\.png/.test(face.sub), JSON.stringify(face));
  await down(fire.x, fire.y);
  await sleep(380);
  I = await info();
  check('giữ nút bắn khi cầm súng: Dave giơ súng (gunAim)', I.dave.state === 'gunAim', I.dave.state);
  await up();
  await page.waitForFunction(() => HX_DEBUG.info().gun.fired === 1, null, { timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => HX_DEBUG.info().gun.shots === 0, null, { timeout: 4000 }).catch(() => {});
  const F = await fishBy(tf);
  I = await info();
  check('thả không kéo: súng tự nhắm con gần nhất, trúng (còn dưới 16 máu), nút bắn 7/8', F && F.hp < 16 && I.gun.ammo === 7 && (await page.textContent('#tb-fire-ammo')) === '7/8', JSON.stringify(F) + ' ' + I.gun.ammo);
  await tap('tb-switch');

  // ---- tăng tốc là công tắc ----
  await home();
  await tap('tb-boost');
  const on = await page.evaluate(() => document.getElementById('tb-boost').classList.contains('on'));
  await down(sx, sy); await move(sx + 100, sy); await sleep(300);
  const boosting = await page.evaluate(() => HX.game.diver.boosting);
  await up();
  await tap('tb-boost');
  const off = await page.evaluate(() => !document.getElementById('tb-boost').classList.contains('on'));
  check('nút 加速: chạm bật (vòng sáng hiện), bơi thì tăng tốc, chạm lần nữa tắt', on && boosting && off, 'bật ' + on + ', tăng tốc ' + boosting + ', tắt ' + off);

  // ---- lướt: nút ShortDash, có vòng hồi chiêu ----
  await down(sx, sy); await move(sx + 100, sy); await sleep(150);
  await tap('tb-dash');
  await sleep(30);
  I = await info();
  const cd = await page.evaluate(() => getComputedStyle(document.getElementById('tb-dash-cd')).getPropertyValue('--k'));
  await up();
  check('nút lướt khi đang bơi: Dave lướt, vòng hồi chiêu phủ nút', (I.dave.state === 'dash' || /ShortDash/.test(I.dave.anim)) && parseFloat(cd) > 0, I.dave.state + ' ' + I.dave.anim + ' --k=' + cd);

  // ---- tạm dừng và tắt tiếng ----
  await tap('btn-pause');
  const paused = await page.evaluate(() => !document.getElementById('pause').hidden);
  await page.tap('#p-resume');
  const m0 = await page.evaluate(() => document.getElementById('btn-mute').classList.contains('off'));
  await tap('btn-mute');
  const m1 = await page.evaluate(() => document.getElementById('btn-mute').classList.contains('off'));
  await tap('btn-mute');
  check('nút menu mở bảng tạm dừng; nút loa bật/tắt tiếng', paused && m1 === !m0, 'tạm dừng ' + paused + ', loa ' + m0 + '→' + m1);

  check('cảm ứng: ô súng góc trái ẩn vì số đạn nằm trên nút bắn', await page.evaluate(() => getComputedStyle(document.getElementById('gunbox')).display === 'none'));
  check('không có lỗi trang, lỗi console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// Máy tính: không cảm ứng thì HUD cảm ứng không hiện, O₂ vẫn ở góc trái như cũ.
async function desktop(browser, base) {
  out.push('\n[1280x720 máy tính]');
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03&theme=day&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await page.click('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
  await page.click('#prep-go');
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  const d = await page.evaluate(() => ({ touch: document.body.classList.contains('touch'), tc: getComputedStyle(document.getElementById('tc')).display,
    o2: document.getElementById('o2box').getBoundingClientRect().left, pause: document.getElementById('btn-pause').getBoundingClientRect().width }));
  check('máy tính: không lớp touch, HUD cảm ứng ẩn, O₂ ở góc trái, nút tạm dừng 44 px như cũ', !d.touch && d.tc === 'none' && d.o2 < 20 && d.pause === 44, JSON.stringify(d));
  await page.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 844, 390);
    await run(browser, base, 740, 360);
    await desktop(browser, base);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
