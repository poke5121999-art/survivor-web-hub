/*
 * HỐ XANH — HUD lúc lặn theo bản Android (InGameTouchCanvas, data/mobile_ui.js), trên điện thoại lẫn máy tính.
 *
 * Chạy:  node test/ho-xanh-touch.js
 * Điện thoại ngang giả lập (hasTouch, isMobile) ở 844×390 và 740×360; ngón tay gửi qua CDP Input.dispatchTouchEvent.
 * Máy tính 1280×720 không cảm ứng: cùng HUD, nút có ảnh phím PC, bấm chuột được, bàn phím và chuột ngắm vẫn như cũ.
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-touch-shots): HUD lúc bơi, ngắm, kéo vào ô huỷ, giằng co, bảng tạm dừng, cài đặt.
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
  await page.evaluate(() => HX_DEBUG.go('loading'));
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
  check('chạm nút đổi: nút bắn hiện súng trường (Item_BasicRifle) và 8/8 viên, nút nhỏ hiện mũi xiên', /Item_BasicRifle\.png/.test(face.icon) && face.ammo === '8/8' && /(NormalHarpoonHead_Thumbnail|icon_harpoon)\.png/.test(face.sub), JSON.stringify(face));
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
  check('nút lướt khi đang bơi: Dave lướt (hồi chiêu chỉ chạy khi lướt thật), vòng hồi chiêu phủ nút', parseFloat(cd) > 0 && I.dave.state !== 'dead', I.dave.state + ' ' + I.dave.anim + ' --k=' + cd);

  // ---- mũi xiên đang lắp nằm trên nút bắn; drone chỉ hiện khi có (hợp đồng G.drone của phần đồ lặn) ----
  await home();
  const head0 = await page.evaluate(() => document.getElementById('tb-fire-icon').src);
  const h0 = await page.evaluate(() => HX.game.loadout.head);
  await page.evaluate(() => { HX.game.loadout.head = { id: 'test', name: 'thử', icon: 'art/ui/mobile/icon_knife.png' }; });
  await sleep(120);
  const head1 = await page.evaluate(() => document.getElementById('tb-fire-icon').src);
  await page.evaluate(h => { HX.game.loadout.head = h; }, h0);
  // mũi thường: ảnh NormalHarpoonHead_Thumbnail (ảnh GunShow gốc của nút bắn Android), từ HX_META.HEADS hoặc bóc thẳng từ APK
  check('mũi xiên đang lắp lên nút bắn (GunShow): mũi thường = NormalHarpoonHead_Thumbnail, mũi khác = ảnh của mũi đó',
    /(NormalHarpoonHead_Thumbnail|icon_harpoon)\.png/.test(head0) && /ui\/mobile\/icon_knife\.png/.test(head1), head0 + ' → ' + head1);
  const realDrone = await page.evaluate(() => HX.game.drone);
  const d0 = await box('tb-drone');
  await page.evaluate(() => { window.__dr = HX.game.drone; HX.game.drone = { left: 2, max: 2, ok: true, delivered: [], canCall: function () { return this.ok; }, target: function () { return null; }, update: function () {}, remove: function () {} }; });
  await sleep(120);
  const d1 = await box('tb-drone'), dn = await page.textContent('#tb-drone-n');
  await page.evaluate(() => { HX.game.drone.ok = false; HX.game.drone.left = 0; });
  await sleep(120);
  const grey = await page.evaluate(() => document.getElementById('tb-drone').classList.contains('off'));
  await page.evaluate(() => { HX.game.drone = window.__dr; });
  check('nút 无人机 ở chỗ gốc (cách phải 832, cách đáy 152, cỡ 144): ẩn khi không có drone, hiện số lượt, xám khi không gọi được',
    (realDrone != null || !d0.shown) && d1.shown && near(d1.x, W - 832 * u, 1.5) && near(d1.y, H - 152 * u, 1.5) && near(d1.w, 144 * u, 1.5) && dn === '2' && grey,
    JSON.stringify({ realDrone: realDrone != null, d0: d0.shown, d1, dn, grey }));

  // ---- menu 菜单: bảng tạm dừng PausePanel, cài đặt nút ----
  await page.evaluate(() => { HX_DEBUG.giveCatch('ClownFish'); HX_DEBUG.giveCatch('Coral_Trout'); });
  await tap('btn-pause');
  const pz = await page.evaluate(() => ({ open: !document.getElementById('pause').hidden, fish: document.querySelectorAll('#pz-fish img').length, count: document.getElementById('pz-count').textContent }));
  await shot('pause');
  check('nút menu mở bảng tạm dừng: 2 con cá đã bắt, số túi', pz.open && pz.fish === 2 && /^2\//.test(pz.count), JSON.stringify(pz));
  await page.tap('#p-setting');
  await sleep(150);
  await shot('settings');
  const fire0 = (await box('tb-fire')).w;
  await page.evaluate(() => { const i = document.querySelector('#set-size input'); i.value = 100; i.dispatchEvent(new Event('input')); });
  const fire1 = (await box('tb-fire')).w;
  await page.evaluate(() => { const i = document.querySelector('#set-alpha input'); i.value = 40; i.dispatchEvent(new Event('input')); });
  const op = await page.evaluate(() => getComputedStyle(document.getElementById('tb-fire')).opacity);
  check('cài đặt: cỡ nút 50 → 100 phóng nút bắn ×1,5; độ đục 40 làm nút mờ còn 0,4', near(fire1, fire0 * 1.5, 1) && op === '0.4', fire0.toFixed(1) + ' → ' + fire1.toFixed(1) + ' px, opacity ' + op);
  const snd0 = await page.evaluate(() => localStorage.getItem('hx.mute'));
  await page.tap('#set-sound .set-tog');
  const snd1 = await page.evaluate(() => localStorage.getItem('hx.mute'));
  await page.tap('#set-sound .set-tog');
  check('cài đặt: công tắc âm thanh bật / tắt tiếng (lưu hx.mute)', snd1 === '1' && snd1 !== snd0, snd0 + ' → ' + snd1);
  await page.tap('#set-fixed .set-tog');
  await page.tap('#set-sprint input[value="wheel"]');
  await page.tap('#set-back');
  await page.tap('#p-resume');
  await sleep(150);
  const fixedUi = await page.evaluate(() => ({ stick: !document.getElementById('stick').hidden, boost: getComputedStyle(document.getElementById('tb-boost')).display }));
  const hs = await box('stick');
  check('左摇杆固定: đáy cần nằm yên ở chỗ gốc (540, 360) khi chưa chạm; 冲刺模式 轮盘: ẩn nút 加速',
    fixedUi.stick && near(hs.x, 540 * u, 2) && near(hs.y, H - 360 * u, 2) && fixedUi.boost === 'none', JSON.stringify({ fixedUi, hs }));
  await home();
  await down(sx + 200, sy - 40);
  await move(sx + 200 + 30, sy - 40); await move(540 * u + 150 * u * 1.5 * 1.2, H - 360 * u);
  await sleep(300);
  const wheel = await page.evaluate(() => ({ boost: HX.game.diver.boosting, arrow: document.getElementById('stick').classList.contains('sprint'), at: document.getElementById('stick').getBoundingClientRect().left }));
  await shot('wheel');
  await up();
  check('cần cố định: chạm chỗ khác trong vùng vẫn lấy gốc ở chỗ cũ; đẩy hết tầm là tăng tốc, hiện mũi tên 摇杆冲刺表现', wheel.boost && wheel.arrow, JSON.stringify(wheel));
  await page.evaluate(() => { const H = HX.hud; H.setPref('size', 50); H.setPref('alpha', 100); H.setPref('fixedStick', false); H.setPref('sprint', 'button'); });

  check('ô súng cũ góc trái đã bỏ (số đạn nằm trên nút bắn)', await page.evaluate(() => !document.getElementById('gunbox')));
  check('không có lỗi trang, lỗi console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

// Máy tính 1280×720, không cảm ứng: HUD Android vẫn hiện, mỗi nút có ảnh phím PC gốc, bấm chuột được; bàn phím + chuột ngắm như cũ.
async function desktop(browser, base) {
  const W = 1280, H = 720, u = W / 2340, tag = '1280x720-pc';
  out.push('\n[' + W + 'x' + H + ' máy tính]');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const info = () => page.evaluate(() => HX_DEBUG.info());
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const box = id => page.evaluate(i => { const e = document.getElementById(i), r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, shown: r.width > 0 && getComputedStyle(e).display !== 'none' }; }, id);
  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03&theme=day&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await page.evaluate(() => HX.save.commit(s => HX_META.buyGun(s, 'rifle').save));
  await page.evaluate(() => HX_DEBUG.go('loading'));
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
  await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); });

  const d = await page.evaluate(() => ({ touch: document.body.classList.contains('touch'), tc: getComputedStyle(document.getElementById('tc')).display,
    o2: document.getElementById('o2box').getBoundingClientRect().toJSON(), old: ['gunbox', 'hint-line', 'btn-mute'].filter(i => document.getElementById(i)) }));
  check('máy tính: không lớp touch mà HUD Android vẫn hiện; O₂ ở góc phải trên như bản Android; bỏ hẳn ô súng, dòng gợi ý, nút loa cũ',
    !d.touch && d.tc === 'block' && near(d.o2.right, W - 320 * u, 1.5) && d.o2.top < 20 && d.old.length === 0, JSON.stringify(d));
  const want = { 'tb-fire': [396, 196, 240], 'tb-knife': [396, 470, 208], 'tb-boost': [180, 288, 160], 'tb-dash': [180, 470, 160], 'tb-switch': [284, 84, 120] };
  const pos = [];
  for (const id of Object.keys(want)) {
    const [dx, dy, s] = want[id], b = await box(id);
    if (!(b.shown && near(b.x, W - dx * u, 1.5) && near(b.y, H - dy * u, 1.5) && near(b.w, s * u, 1.5))) pos.push(id + ' ' + JSON.stringify(b));
  }
  check('nút ở đúng chỗ gốc trên canvas 2340 (bắn, dao, tăng tốc, lướt, đổi súng)', !pos.length, pos.join(' | '));
  const glyph = await page.evaluate(() => [...document.querySelectorAll('#tc img.kg')].filter(i => getComputedStyle(i.closest('.tc-p')).display !== 'none' && getComputedStyle(i).display !== 'none')
    .map(i => i.closest('.tc-p').id + ':' + i.alt + ':' + (i.naturalWidth > 0)).sort());
  const wantG = ['btn-pause:Esc:true', 'tb-boost:Shift:true', 'tb-dash:Space:true', 'tb-fire:Mouse_Left:true', 'tb-knife:F:true', 'tb-switch:Mouse_Right:true'];
  check('mỗi nút hiện ảnh phím PC gốc (InputAtlas_Keyboard): Space lướt, Shift tăng tốc, F dao, chuột trái bắn, chuột phải súng, Esc menu',
    JSON.stringify(glyph) === JSON.stringify(wantG), JSON.stringify(glyph));
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
  const home = async () => {
    await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(s => { HX_DEBUG.teleport(s.x, s.y); HX.game.diver.facing = 1; HX_DEBUG.clearFish(); HX.game.catches.length = 0; HX_DEBUG.setO2(90); HX.game.diver.invuln = 0; }, spot);
    await sleep(250);
  };
  const killed = uid => page.waitForFunction(id => { const f = HX_DEBUG.fishAt().find(q => q.uid === id); return f && f.hp <= 0; }, uid, { timeout: 2000 }).then(() => true, () => false);

  // chuột bấm nút dao: vung dao hạ cá hề sát bên
  await home();
  const c1 = await page.evaluate(s => HX_DEBUG.spawnFish('ClownFish', s.x + 0.6, s.y + 0.05, true), spot);
  const kb = await box('tb-knife');
  await page.mouse.click(kb.x, kb.y);
  check('bấm chuột vào nút dao: Dave vung dao, hạ cá hề', await killed(c1));

  // bàn phím: F dao, D bơi, Space lướt, Shift tăng tốc
  await home();
  const c2 = await page.evaluate(s => HX_DEBUG.spawnFish('ClownFish', s.x + 0.6, s.y + 0.05, true), spot);
  await sleep(900);  // dao còn hồi sau nhát bằng nút
  await page.keyboard.press('KeyF');
  check('phím F vẫn vung dao', await killed(c2));
  await home();
  const x0 = (await info()).dave.x;
  await page.keyboard.down('KeyD'); await sleep(700);
  const x1 = (await info()).dave.x;
  await page.keyboard.down('ShiftLeft'); await sleep(200);
  const boost = await page.evaluate(() => HX.game.diver.boosting);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('Space'); await sleep(40);
  const I = await info();
  const cd = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('tb-dash-cd')).getPropertyValue('--k')));
  await page.keyboard.up('KeyD');
  check('giữ D bơi sang phải, Shift tăng tốc, Space lướt (vòng hồi chiêu phủ nút lướt)', x1 - x0 > 1 && boost && (I.dave.state === 'dash' || /ShortDash/.test(I.dave.anim)) && cd > 0,
    JSON.stringify({ dx: +(x1 - x0).toFixed(2), boost, state: I.dave.state, anim: I.dave.anim, cd }));

  // chuột trái giữ để ngắm, thả để bắn: như cũ
  await home();
  const clown = await page.evaluate(() => { const d = HX.game.diver, t = d.gunTip(); return HX_DEBUG.spawnFish('ClownFish', t.x + 3, t.y - 0.015, true); });
  const fp = await page.evaluate(id => { const f = HX_DEBUG.fishAt().find(q => q.uid === id); return HX_DEBUG.worldToScreen(f.cx, f.cy); }, clown);
  await page.mouse.move(fp.x, fp.y);
  await page.mouse.down(); await sleep(400);
  const aimSt = (await info()).dave.state;
  await page.mouse.up();
  await page.waitForFunction(() => HX_DEBUG.info().catches.length === 1, null, { timeout: 5000 }).catch(() => {});
  check('giữ chuột trái trên cảnh để ngắm, thả để bắn: xiên trúng cá hề', aimSt === 'aim' && JSON.stringify((await info()).catches) === '["ClownFish"]', aimSt + ' ' + JSON.stringify((await info()).catches));

  // chuột kéo từ đáy cần ở chỗ gốc: cần hiện và Dave bơi; bấm chỗ khác ở nửa trái vẫn là ngắm
  await home();
  const hx = 540 * u, hy = H - 360 * u, x2 = (await info()).dave.x;
  await page.mouse.move(hx, hy); await page.mouse.down();
  await page.mouse.move(hx + 40, hy, { steps: 4 }); await page.mouse.move(hx + 90, hy, { steps: 4 });
  await sleep(600);
  const stick = await box('stick'), st2 = (await info()).dave.state;
  await page.mouse.up();
  const x3 = (await info()).dave.x;
  check('chuột kéo từ đáy cần (540, 360): cần hiện ở chỗ bấm, Dave bơi sang phải, không rút xiên', stick.shown && near(stick.x, hx, 2) && x3 - x2 > 0.8 && st2 !== 'aim', JSON.stringify({ stick, dx: x3 - x2, st2 }));
  check('thả chuột: cần ẩn', !(await box('stick')).shown);

  // Esc mở bảng tạm dừng; bấm Cài đặt; Esc lần nữa đóng
  await page.keyboard.press('Escape');
  const pOpen = await page.evaluate(() => !document.getElementById('pause').hidden);
  await shot('pause');
  await page.click('#p-setting');
  await sleep(150);
  await shot('settings');
  const sOpen = await page.evaluate(() => !document.getElementById('settings').hidden);
  await page.click('#set-back');
  await page.keyboard.press('Escape');
  const pClosed = await page.evaluate(() => document.getElementById('pause').hidden);
  check('Esc mở bảng tạm dừng, nút Cài đặt mở bảng điều khiển, Esc đóng lại', pOpen && sOpen && pClosed, JSON.stringify({ pOpen, sOpen, pClosed }));
  // bấm chuột vào nút menu 菜单 cũng mở
  const mb = await box('btn-pause');
  await page.mouse.click(mb.x, mb.y);
  const pOpen2 = await page.evaluate(() => !document.getElementById('pause').hidden);
  await page.click('#p-resume');
  check('bấm chuột vào nút menu 菜单: mở bảng tạm dừng; Đóng thì lặn tiếp', pOpen2 && await page.evaluate(() => document.getElementById('pause').hidden));
  // cá drone đã kéo lên thuyền (G.drone.delivered) tính vào màn kết quả cùng cá trong túi
  await page.evaluate(() => {
    HX.game.drone = { left: 0, max: 1, delivered: ['Coral_Trout'], canCall: () => false, target: () => null, update: () => {}, remove: () => {} };
    HX.game.catches.length = 0; HX_DEBUG.giveCatch('ClownFish'); HX.game.onSurface();
  });
  await sleep(300);
  const res = await page.evaluate(() => ({ sub: document.getElementById('r-sub').textContent, ids: [...document.querySelectorAll('#r-grid .r-fish')].map(e => e.dataset.id).sort() }));
  check('màn kết quả đếm cả cá drone kéo lên: "Mang về 2 con", lưới có cá hề và cá mú', /Mang về 2 con/.test(res.sub) && JSON.stringify(res.ids) === '["ClownFish","Coral_Trout"]', JSON.stringify(res));
  check('máy tính: không lỗi trang, console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
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
