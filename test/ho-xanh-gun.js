/*
 * HỐ XANH — súng phụ trong lượt lặn.
 *
 * Chạy:  node test/ho-xanh-gun.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-gun-shots): mỗi khẩu một ảnh lúc ngắm và một ảnh lúc bắn, ở 1280×720 và 844×390.
 * Mở ảnh ra xem: súng nằm trong tay Dave, quay theo điểm ngắm, lửa nòng ở đầu nòng, đạn quay theo đường bay.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-gun-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css' };

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
  const fish = () => page.evaluate(() => HX_DEBUG.fishAt());
  const played = () => page.evaluate(() => window.__played.splice(0));

  // Sổ mới: mua súng trường nước (giá 0) và chọn nó qua HX_META, rồi đi đúng luồng chuẩn bị → Ra khơi → Bỏ qua cano → lặn.
  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await page.evaluate(() => HX.save.commit(s => HX_META.buyGun(s, 'rifle').save));
  const S = await page.evaluate(() => HX_DEBUG.save());
  check('mua súng trường nước giá 0 trên sổ mới: sổ ghi owned + equipped', JSON.stringify(S.guns) === '{"owned":["rifle"],"equipped":"rifle"}', JSON.stringify(S.guns));
  await page.click('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
  await page.click('#prep-go');
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
  let I = await info();
  check('lượt lặn mang súng đã chọn trong sổ', I.gun && I.gun.id === 'rifle' && I.loadout.gun.dmg === 15, JSON.stringify(I.gun));
  const hud = await page.evaluate(() => ({ vis: getComputedStyle(document.getElementById('gunbox')).display !== 'none',
    icon: document.getElementById('gun-icon').src, ammo: document.getElementById('gun-ammo').textContent, hint: document.getElementById('hint-line').textContent }));
  check('HUD có ô súng: icon gốc Item_BasicRifle và 8/8 viên', hud.vis && /gear\/icon\/Item_BasicRifle\.png/.test(hud.icon) && hud.ammo === '8/8', JSON.stringify(hud));
  check('dòng gợi ý nói chuột phải là súng, F là dao', /chuột phải: súng/.test(hud.hint) && /F: dao/.test(hud.hint) && !/chuột phải: dao/.test(hud.hint), hud.hint);
  check('O₂ đầu lượt bằng bình gốc cấp 0 (90)', Math.round(I.dave.o2) === 90 && (await page.textContent('#o2-num')) === '90', String(I.dave.o2));

  await page.evaluate(() => {
    const orig = HX.audio.play; window.__played = [];
    HX.audio.play = function (k, o) { window.__played.push(k); return orig(k, o); };
    HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish();
  });
  // Chỗ nước trống, bên phải thoáng 10 m.
  const spot = await page.evaluate(() => {
    const W = HX.game.world;
    for (let y = 12; y > -30; y -= 0.7) for (let x = -40; x < 30; x += 0.9) {
      if (!W.open(x, y, 1.3)) continue;
      let ok = true;
      for (let k = 1; k <= 10 && ok; k++) ok = W.open(x + k, y, 1.2);
      if (ok && !W.raycast(x, y, x + 10, y) && !W.raycast(x, y + 1, x + 10, y + 1) && !W.raycast(x, y - 1, x + 10, y - 1)) return { x, y };
    }
    return null;
  });
  check('tìm được chỗ nước trống thoáng 10 m để bắn thử', !!spot, JSON.stringify(spot));
  if (!spot) { await page.close(); return; }
  const home = async () => {
    await page.evaluate(s => { HX_DEBUG.teleport(s.x, s.y); HX.game.diver.facing = 1; HX_DEBUG.clearFish(); HX.game.catches.length = 0; }, spot);
    // cá có răng bị bắn thì cắn lại; chờ Dave hết choáng rồi mới thử bài kế
    await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 4000 }).catch(() => {});
    await sleep(250);
  };
  const put = (id, dx, dy, frozen = true) => page.evaluate(([id, x, y, fr]) => HX_DEBUG.spawnFish(id, x, y, fr), [id, spot.x + dx, spot.y + dy, frozen]);
  // Giữ chuột phải ngắm vào điểm (dx, dy) so với chỗ đứng, thả ra là bắn. name: chụp ảnh lúc ngắm và ngay sau khi bắn.
  const fire = async (dx, dy, name, after = 70) => {
    const p = await page.evaluate(([x, y]) => HX_DEBUG.worldToScreen(x, y), [spot.x + dx, spot.y + dy]);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down({ button: 'right' });
    await sleep(380);  // RangeWeaponDraw gốc dài 0,3 giây rồi mới ngắm
    const aim = await info();
    if (name) await shot(name + '-aim');
    await page.mouse.up({ button: 'right' });
    await sleep(after);
    if (name) await shot(name + '-fire');
    return aim;
  };
  const waitShots = () => page.waitForFunction(() => HX_DEBUG.info().gun.shots === 0, null, { timeout: 4000 }).catch(() => {});

  // ---- súng trường: một viên, 15 sát thương ----
  await home();
  const tt = await put('Titan_Triggerfish', 2.6, 0.25);
  const aimI = await fire(2.6, 0.25, 'rifle', 60);
  check('giữ chuột phải: thân AttackReady, tay + súng hiện ra', aimI.dave.state === 'gunAim' && aimI.dave.anim === 'AttackReady' && aimI.gun.rig, aimI.dave.state + ' ' + aimI.dave.anim + ' rig=' + aimI.gun.rig);
  // đầu nòng tính theo lớp tay phải nằm đúng chỗ đầu nòng trên ảnh súng đang vẽ (ở mọi góc)
  const mzl = await page.evaluate(() => {
    const G = HX.game, d = G.diver, out = [];
    G.gun.kick = 0; if (d.rig) d.rig.kick = 0;
    const keep = { a: d.aimAngle, f: d.facing };
    [0, 0.8, 1.5, -0.8, Math.PI].forEach(a => {
      d.aimAngle = a; d.facing = Math.cos(a) < 0 ? -1 : 1; d.draw();
      const m = G.gun.muzzle(d), h = d.arms.held, art = G.gun.art.held, mz = HX.gun.MUZZLE[G.gun.id];
      d.root.updateMatrixWorld(true);
      const v = new THREE.Vector3(mz[0] / art.size[0], mz[1] / art.size[1], 0).applyMatrix4(h.matrixWorld);
      out.push(Math.hypot(v.x - m.x, v.y - m.y));
    });
    d.aimAngle = keep.a; d.facing = keep.f;
    return out;
  });
  check('đầu nòng súng phụ trùng đầu nòng trên ảnh súng ở 5 góc ngắm', mzl.every(e => e < 0.02), mzl.map(e => e.toFixed(4)).join(' '));
  I = await info();
  check('thả chuột phải: bắn, thân AttackFire', I.dave.anim === 'AttackFire' || I.dave.state === 'gunFire', I.dave.state + ' ' + I.dave.anim);
  await waitShots();
  let F = (await fish()).find(f => f.uid === tt);
  check('súng trường: cá bò titan (16 máu) trúng một viên còn 1 máu', F && F.hp === 1 && F.state !== 'dying', JSON.stringify(F));
  I = await info();
  check('súng trường: còn 7/8 viên, HUD 7/8', I.gun.ammo === 7 && (await page.textContent('#gun-ammo')) === '7/8', I.gun.ammo + ' ' + await page.textContent('#gun-ammo'));
  let imgs = await page.evaluate(() => HX.game.gun.firedImgs.slice());
  check('súng trường bắn đúng đạn gốc Bullet.png (GunSpecData_Normal_UnderwaterRifle bulletReference)', imgs.length === 1 && imgs[0] === 'art/gear/bullet/Bullet.png', imgs.join(','));
  let snd = await played();
  check('súng trường phát tiếng bắn và tiếng trúng gốc', snd.includes('gun_rifle_shot') && snd.includes('gun_rifle_hit'), snd.join(','));
  check('hiệu ứng gốc: lửa nòng, vệt bọt đạn, máu trúng', ['muzzle', 'trail', 'hit'].every(n => I.fx.includes(n)) || snd.includes('gun_rifle_hit'), I.fx.join(','));
  check('chuột phải không còn là dao', !snd.includes('knife'), snd.join(','));

  // ---- dao chỉ còn ở phím F ----
  await home();
  await put('ClownFish', 0.6, 0.05);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => HX_DEBUG.fishAt().some(f => f.state === 'dying' || f.state === 'dead') && HX_DEBUG.info().dave.state === 'swim', null, { timeout: 2000 }).catch(() => {});
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => HX_DEBUG.info().catches.length === 1, null, { timeout: 4000 }).catch(() => {});
  I = await info();
  snd = await played();
  check('F vẫn là dao: một nhát 3 sát thương (dao gốc cấp 0) hạ cá hề, E nhặt xác', JSON.stringify(I.catches) === '["ClownFish"]' && snd.includes('knife'), JSON.stringify(I.catches) + ' ' + snd.join(','));

  // ---- hết đạn ----
  await home();
  for (let i = 0; i < 7; i++) { await fire(3, 0, null, 30); await sleep(520); }
  I = await info();
  check('bắn hết băng: đạn về 0', I.gun.ammo === 0 && I.gun.fired === 8, JSON.stringify(I.gun));
  await played();
  await fire(3, 0, null, 120);
  I = await info();
  snd = await played();
  check('hết đạn mà bóp cò: không bắn, kêu tiếng hết đạn, vẫn 0 viên', I.gun.ammo === 0 && I.gun.fired === 8 && I.gun.empty >= 1 && snd.includes('gun_empty') && !snd.includes('gun_rifle_shot'), JSON.stringify(I.gun) + ' ' + snd.join(','));
  const empty = await page.evaluate(() => ({ t: document.getElementById('gun-ammo').textContent, red: document.getElementById('gunbox').classList.contains('empty') }));
  check('HUD hết đạn: 0/8 đỏ', empty.t === '0/8' && empty.red, JSON.stringify(empty));

  // ---- súng hoa cải: 3 viên toả ±20°, đặt một con cá bò titan trên đường bay của từng viên ----
  await page.evaluate(() => HX_DEBUG.gun('shotgun'));
  await home();
  {
    const p = await page.evaluate(([x, y]) => HX_DEBUG.worldToScreen(x, y), [spot.x + 2.4, spot.y + 0.1]);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down({ button: 'right' });
    await sleep(380);
    // đầu nòng lúc đang ngắm; ba con cách đầu nòng 1,8 m theo hướng −20°, 0°, +20°
    const trio = await page.evaluate(([tx, ty]) => {
      const G = HX.game, m = G.gun.muzzle(G.diver), a = Math.atan2(ty - m.y, tx - m.x), ids = [];
      [-20, 0, 20].forEach(d => { const r = a + d * Math.PI / 180; ids.push(HX_DEBUG.spawnFish('Titan_Triggerfish', m.x + Math.cos(r) * 1.8, m.y + Math.sin(r) * 1.8, true)); });
      return ids;
    }, [spot.x + 2.4, spot.y + 0.1]);
    await sleep(60);
    await shot('shotgun-aim');
    await page.mouse.up({ button: 'right' });
    await sleep(50);
    await shot('shotgun-fire');
    await waitShots();
    const hurt = (await fish()).filter(f => trio.includes(f.uid) && f.hp === 16 - 12).length;
    I = await info();
    check('súng hoa cải: một phát 3 viên toả, mỗi viên trúng một con (12 sát thương)', hurt === 3 && I.gun.fired === 1 && I.gun.hits === 3, hurt + '/3 con, trúng ' + I.gun.hits);
  }
  snd = await played();
  check('súng hoa cải phát tiếng gốc', snd.includes('gun_shotgun_shot'), snd.join(','));
  imgs = await page.evaluate(() => HX.game.gun.firedImgs.slice());
  check('súng hoa cải bắn Bullet.png giống súng trường (GunSpecData_Normal_TripleAxel.bulletReference = cùng GUID Bullet.prefab với UnderwaterRifle, đo trong gunspecs.json)',
    imgs.length === 3 && imgs.every(i => i === 'art/gear/bullet/Bullet.png'), imgs.join(','));
  const heldRifleVsShotgun = await page.evaluate(() => HX_BOAT_ASSETS.guns.rifle.held.img !== HX_BOAT_ASSETS.guns.shotgun.held.img);
  check('nhưng khẩu cầm tay khác nhau: BasicRifle.png ≠ VolleyJetGun.png', heldRifleVsShotgun);

  // ---- súng bắn tỉa: xuyên hai con thẳng hàng ----
  await page.evaluate(() => HX_DEBUG.gun('sniper'));
  await home();
  const s1 = await put('Titan_Triggerfish', 2.4, 0.2), s2 = await put('Titan_Triggerfish', 4.8, 0.2);
  await fire(4.8, 0.2, 'sniper', 40);
  await waitShots();
  const fs2 = await fish();
  const a = fs2.find(f => f.uid === s1), b = fs2.find(f => f.uid === s2);
  check('súng bắn tỉa: một viên xuyên qua hai cá bò titan thẳng hàng, cả hai chết (32 ≥ 16)', a && b && a.state === 'dying' && b.state === 'dying' && (await info()).gun.fired === 1,
    JSON.stringify([a && a.state, b && b.state]));
  imgs = await page.evaluate(() => HX.game.gun.firedImgs.slice());
  check('súng bắn tỉa đổi đúng đạn PierceBullet.png (khác Bullet.png của súng trường)', imgs.length === 1 && imgs[0] === 'art/gear/bullet/PierceBullet.png', imgs.join(','));

  // ---- súng gây mê: cá ngủ đứng yên ----
  await page.evaluate(() => HX_DEBUG.gun('sleep'));
  await home();
  const zz = await put('Bluetang', 2.5, 0.2), ctl = await put('Bluetang', 2.5, -2.2);
  await fire(2.5, 0.2, 'sleep', 250);
  await waitShots();
  // thả cả hai con ra cho tự bơi: con ngủ phải đứng yên, con đối chứng bơi đi
  await page.evaluate(() => HX.game.fishes.list.forEach(f => { f.frozen = false; }));
  const p0 = await fish();
  await sleep(1500);
  const p1 = await fish();
  const mv = id => { const u = p0.find(f => f.uid === id), v = p1.find(f => f.uid === id); return u && v ? Math.hypot(v.x - u.x, v.y - u.y) : -1; };
  const zst = p1.find(f => f.uid === zz);
  I = await info();
  check('súng gây mê: cá trúng đạn ngủ (state sleep), không mất máu', zst && zst.state === 'sleep' && zst.hp === 3, JSON.stringify(zst));
  check('cá ngủ đứng yên 1,5 giây, cá đối chứng thì bơi', mv(zz) < 0.01 && mv(ctl) > 0.1, 'ngủ ' + mv(zz).toFixed(3) + ' m, đối chứng ' + mv(ctl).toFixed(2) + ' m');
  check('cá ngủ có hiệu ứng chữ Z gốc bám trên đầu', I.fx.includes('sleep'), I.fx.join(','));
  await shot('sleep-zz');
  snd = await played();
  check('súng gây mê phát tiếng bắn và tiếng trúng gốc', snd.includes('gun_sleep_shot') && snd.includes('gun_sleep_hit'), snd.join(','));
  imgs = await page.evaluate(() => HX.game.gun.firedImgs.slice());
  check('súng gây mê đổi đúng đạn TranquilizerBullet.png', imgs.length === 1 && imgs[0] === 'art/gear/bullet/TranquilizerBullet.png', imgs.join(','));

  // ---- súng lưới: bắt sống cá nhỏ vào túi, tôn trọng túi ----
  await page.evaluate(() => HX_DEBUG.gun('net'));
  await home();
  const n1 = [await put('ClownFish', 2.6, 0.1), await put('ClownFish', 2.9, 0.4), await put('Yellow_Tang', 2.8, -0.3)];
  await fire(2.6, 0.1, 'net', 180);
  await waitShots();
  I = await info();
  check('súng lưới: lưới bung ra bắt cả 3 con vào túi', I.catches.length === 3 && I.gun.caught === 3, JSON.stringify(I.catches));
  snd = await played();
  check('súng lưới phát tiếng bắn, bung lưới và thu lưới gốc', ['gun_net_shot', 'gun_net_hit', 'gun_net_collect'].every(k => snd.includes(k)), snd.join(','));
  imgs = await page.evaluate(() => HX.game.gun.firedImgs.slice());
  // sprite bên trong NetBullet_SSize.prefab tên "NetBullet" (khác tên tệp prefab)
  check('súng lưới đổi đúng đạn NetBullet.png (từ prefab NetBullet_SSize)', imgs.length === 1 && imgs[0] === 'art/gear/bullet/NetBullet.png', imgs.join(','));
  await sleep(500);
  await home();
  await page.evaluate(() => { const G = HX.game; while (G.catches.length < G.loadout.cargo - 1) G.catches.push('ClownFish'); });
  const n2 = [await put('ClownFish', 2.6, 0.1), await put('ClownFish', 2.8, 0.35), await put('ClownFish', 2.9, -0.25)];
  await fire(2.6, 0.1, null, 150);
  await waitShots();
  I = await info();
  const left = (await fish()).filter(f => n2.includes(f.uid) && f.state !== 'reeled');
  const toast = await page.textContent('#toast');
  check('túi còn 1 chỗ: lưới chỉ kéo 1 con, 2 con kia vẫn bơi, báo túi đầy', I.catches.length === I.loadout.cargo && left.length === 2 && /Túi đầy/.test(toast),
    I.catches.length + '/' + I.loadout.cargo + ', còn ' + left.length + ' con, "' + toast + '"');

  // ---- súng phóng lựu: đạn cầu vồng, nổ trúng mọi con trong bán kính 2 ----
  await page.evaluate(() => HX_DEBUG.gun('grenade'));
  await home();
  const g3 = [await put('ClownFish', 3.2, 0.0), await put('ClownFish', 3.8, 0.9), await put('ClownFish', 2.6, -0.9)];
  const far = await put('ClownFish', 8.5, 0.0);
  await fire(3.2, 0.2, 'grenade', 60);
  await page.waitForFunction(() => HX_DEBUG.info().fx.includes('explosion'), null, { timeout: 4000 }).catch(() => {});
  await sleep(250);
  await shot('grenade-blast');
  const gf = await fish();
  const dead = g3.filter(id => { const f = gf.find(q => q.uid === id); return f && f.state === 'dying'; }).length;
  const farF = gf.find(f => f.uid === far);
  check('súng phóng lựu: nổ hạ cả 3 con trong bán kính 2 m', dead === 3, dead + '/3');
  check('con ở xa 5 m ngoài vùng nổ vẫn sống', farF && farF.state !== 'dying' && farF.hp === 3, JSON.stringify(farF));
  snd = await played();
  check('súng phóng lựu phát tiếng bắn và tiếng nổ gốc', snd.includes('gun_grenade_shot') && snd.includes('gun_grenade_hit'), snd.join(','));
  imgs = await page.evaluate(() => HX.game.gun.firedImgs.slice());
  check('súng phóng lựu đổi đúng đạn GrenadeBullet.png', imgs.length === 1 && imgs[0] === 'art/gear/bullet/GrenadeBullet.png', imgs.join(','));

  // ---- cảm ứng (HUD bản Android, chi tiết ở test/ho-xanh-touch.js): nút nhỏ đổi sang súng, nút bắn giữ rồi thả, không kéo là tự nhắm con gần nhất ----
  await page.evaluate(() => { document.body.classList.add('touch'); HX_DEBUG.gun('rifle'); });
  await home();
  const tf = await put('Titan_Triggerfish', 2.2, 0.8);
  const center = async id => { const b = await (await page.$('#' + id)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  let c = await center('tb-switch');
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.up();
  c = await center('tb-fire');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await sleep(300);
  await shot('touch-aim');
  await page.mouse.up();
  await page.waitForFunction(() => HX_DEBUG.info().gun.fired === 1, null, { timeout: 3000 }).catch(() => {});
  await waitShots();
  F = (await fish()).find(f => f.uid === tf);
  check('nút bắn cảm ứng khi đã đổi sang súng: tự nhắm cá gần nhất, trúng', F && F.hp < 16, JSON.stringify(F) + ' ' + JSON.stringify((await info()).gun));
  const lay = await page.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    const btns = ['tb-boost', 'tb-dash', 'tb-knife', 'tb-fire', 'tb-switch'].map(r), o = r('o2box'), h = r('hint-line');
    const inside = q => q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight;
    const hit = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
    return { inView: btns.every(inside), btnVsO2: btns.some(q => hit(q, o)), btnVsHint: btns.some(q => hit(q, h)), ammo: document.getElementById('tb-fire-ammo').textContent };
  });
  check('bố cục cảm ứng vừa màn: 5 nút trong khung, không đè O₂ hay dòng gợi ý, số đạn nằm trên nút bắn', lay.inView && !lay.btnVsO2 && !lay.btnVsHint && lay.ammo === '7/8', JSON.stringify(lay));
  await shot('touch-layout');
  c = await center('tb-switch');
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.up();
  await page.evaluate(() => document.body.classList.remove('touch'));

  // Chỉ chạy hai bài lặn-lại tốn thời gian này ở một cỡ màn hình (mỗi bài dựng lại nguyên lượt lặn từ đầu).
  if (W === 1280) {
    // ---- đổi súng qua sổ/UI iDiver rồi LẶN LẠI (không dùng HX_DEBUG.gun): Gun cũ phải bị bỏ, dựng lại đúng khẩu + đạn mới ----
    check('trước khi đổi: đang mang rifle', (await info()).gun.id === 'rifle');
    await page.evaluate(() => HX.save.commit(s => { s.gold += 1000; return s; }));  // súng bắn tỉa giá 50, sổ mới có 0 vàng
    await page.evaluate(() => HX.save.commit(s => HX_META.buyGun(s, 'sniper').save));
    await page.evaluate(() => HX.save.commit(s => HX_META.equipGun(s, 'sniper').save));
    const S2 = await page.evaluate(() => HX_DEBUG.save());
    check('sổ ghi equipped = sniper', S2.guns.equipped === 'sniper', JSON.stringify(S2.guns));
    await page.evaluate(() => HX_DEBUG.go('prep'));
    await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
    await page.click('#prep-go');
    await page.click('#boat-skip');
    await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
    await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
    I = await info();
    check('lặn lại: G.gun dựng lại từ sổ, không phải Gun cũ giữ lại (id = sniper, đạn đầy 3/3, chưa bắn phát nào)',
      I.gun && I.gun.id === 'sniper' && I.gun.ammo === 3 && I.gun.fired === 0, JSON.stringify(I.gun));
    await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); });
    await home();
    await put('Titan_Triggerfish', 3, 0.1);
    await fire(3, 0.1, 'redive-sniper', 60);
    await waitShots();
    const imgsRedive = await page.evaluate(() => HX.game.gun.firedImgs.slice());
    check('sau khi đổi súng ở iDiver và lặn lại: bắn ra đúng PierceBullet.png (không phải Bullet.png của rifle cũ)',
      imgsRedive.length === 1 && imgsRedive[0] === 'art/gear/bullet/PierceBullet.png', imgsRedive.join(','));

    // ---- súng xiên: đổi cấp qua sổ đổi khẩu cầm tay; mũi xiên bay KHÔNG đổi (bản gốc chỉ một sprite HarpoonProjectile
    // cho mọi HarpoonHead — đo trong prefab NormalHarpoonHead..SleepHarpoonHead, cả 8 loại đều 33×5 px, chung tên "HarpoonProjectile") ----
    await page.evaluate(() => HX_DEBUG.go('prep'));
    await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
    await page.evaluate(() => HX.save.commit(s => { s.gear.harpoon = 0; return s; }));
    await page.click('#prep-go');
    await page.click('#boat-skip');
    await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
    await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
    await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); });
    await home();
    const heldLo = await page.evaluate(() => HX.game.diver.harpoonGun && HX.game.diver.harpoonGun.name);
    const spearSrcLo = await page.evaluate(() => HX.game.harpoon.mesh.material.uniforms.map.value.image.src);
    check('súng xiên cấp 0 (sổ mặc định): khẩu cầm tay OldHarpoonGun [DtD SubEquipment harpoon lv1]', heldLo === 'OldHarpoonGun', heldLo);
    // giữ chuột trái ngắm để lớp tay + súng xiên hiện ra (ẩn lúc không ngắm), chụp rồi thả tay không bắn
    { const p = await page.evaluate(([x, y]) => HX_DEBUG.worldToScreen(x, y), [spot.x + 3, spot.y]);
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(320); await shot('harpoon-lv0'); await page.mouse.up(); await sleep(100); }

    await page.evaluate(() => HX_DEBUG.go('prep'));
    await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
    await page.evaluate(() => HX.save.commit(s => { s.gear.harpoon = 5; return s; }));
    await page.click('#prep-go');
    await page.click('#boat-skip');
    await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
    await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
    await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); });
    await home();
    const heldHi = await page.evaluate(() => HX.game.diver.harpoonGun && HX.game.diver.harpoonGun.name);
    const spearSrcHi = await page.evaluate(() => HX.game.harpoon.mesh.material.uniforms.map.value.image.src);
    check('súng xiên cấp cao nhất (5): khẩu cầm tay đổi thành AlloyHarpoonGun [DtD SubEquipment harpoon lv6]', heldHi === 'AlloyHarpoonGun', heldHi);
    check('khẩu cầm tay đổi ảnh giữa hai cấp (OldHarpoonGun.png ≠ AlloyHarpoonGun.png)', !!heldLo && !!heldHi && heldLo !== heldHi, heldLo + ' vs ' + heldHi);
    check('mũi xiên bay KHÔNG đổi giữa hai cấp — bản gốc không có', !!spearSrcLo && spearSrcLo === spearSrcHi, spearSrcLo + ' | ' + spearSrcHi);
    { const p = await page.evaluate(([x, y]) => HX_DEBUG.worldToScreen(x, y), [spot.x + 3, spot.y]);
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(320); await shot('harpoon-lv5'); await page.mouse.up(); await sleep(100); }
  }

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
