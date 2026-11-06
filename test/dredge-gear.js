/*
 * DREDGE — Biển Mù: kiểm năng lực và đồ trên thuyền (vòng 2, luồng gear) trên trang thật (Playwright), điều khiển bằng
 * chuột/bàn phím thật (page.mouse, page.keyboard); chỉ dùng móc nội bộ để dựng tình huống (cho đồ, mở khoá) và để đọc số.
 *
 * Chạy:  node test/dredge-gear.js
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-gear.js   (chạy trên Pages)
 * Ảnh chụp: %TEMP%/dredge-gear/ ở 1920×1080 và 844×390.
 * Số mong đợi lấy từ bản gốc:
 *   AbilityRadial.ShowRadial: Time.timeScale = 0,3; 11 nêm (BuildInfo.photoMode), góc chuột theo chiều kim từ đỉnh, nêm i ở 360/11·i;
 *     thứ tự abilityWedges: lights, foghorn, spyglass, pot, trawl, bait, haste, atrophy, banish, manifest, camera (tools/boat.py).
 *   DoAbility = chuột phải (DredgeControlBindings.cs:333-335); L không bật đèn nữa (L gốc = Bách khoa).
 *   VariablePlayerLight: cường độ đèn pha = tổng lumen đèn lành × 0,02, tầm = tầm lớn nhất (light1 500 lm/10 m, light2 750 lm/20 m).
 *   FoghornAbility: giữ = vòng lặp 'foghorn-loop', âm lượng 0,5 → 1, cao độ pitchValues[0] 1,1 → 1,0 trong 0,08 s; thả = 'foghorn-end'
 *     âm lượng 0,5 ở cao độ 1,0.
 *   BoostAbility: AbilitySpeedModifier = boostAmount(clamp01(giữ))·1,3 (1,95 lúc đầu → 1,3 sau 0,5 s); nhiệt cap 8 (hasteHeatCap),
 *     nổ ⇒ một ô máy chưa hỏng bị hỏng; FOV 40 → 50.
 *   SpyglassVCam: FOV 15, theo thuyền +3 m; tia 200 m, lệch < 5° tới điểm câu ⇒ hiện bảng tin.
 *   BoatSubModelToggler: có lưới (net1) ⇒ TrawlNet hiện; tir-net1 ⇒ IronHavenTrawl.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-gear');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// góc nêm i (độ, theo chiều kim từ đỉnh) → điểm chuột cách tâm màn hình r px
function wedgePoint(W, H, i, n) {
  const a = (360 / n * i) * Math.PI / 180, r = 200 * (H / 1080);
  return [W / 2 + Math.sin(a) * r, H / 2 - Math.cos(a) * r];
}

// nước thoáng: điểm cách bờ ≥ 25 m mà 120 m phía trước mũi vẫn cách bờ ≥ 15 m (gần Greater Marrow)
const OPEN_WATER = () => {
  for (let r = 0; r < 400; r += 20) for (let a = 0; a < 6.283; a += 0.5236) {
    const x = 20 + Math.cos(a) * r, z = -30 + Math.sin(a) * r;
    if (DR_DEBUG.sdf(x, z) < 25) continue;
    for (let yaw = 0; yaw < 6.283; yaw += 0.7854) {
      let ok = true;
      for (let t = 10; ok && t <= 120; t += 10) ok = DR_DEBUG.sdf(x - Math.sin(yaw) * t, z - Math.cos(yaw) * t) > 15;
      if (ok) return { x, z, yaw };
    }
  }
  return { x: 20, z: -30, yaw: 0.3 };
};
// thuyền hạng 2 (Tier2Hull: 2 ô đèn, 4 ô lưới) với cần + máy khởi đầu
const HULL2 = () => {
  DR.s.hullTier = 2;
  DR.resetGrid('INVENTORY', DR_CONFIG.hullTierGridConfigs[1]);
  DR.give('rod1'); DR.give('engine1');
  DRBoat.setTier(2); DRBoat.refresh();
};

async function boot(page, base, q) {
  await page.goto(base + '/games/dredge/index.html?' + q);
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });
  await sleep(500);
}

async function run(browser, base) {
  const W = 1920, H = 1080;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, '1920x1080-' + name + '.png') });
  const ab = () => page.evaluate(() => DRAbilities.debug());
  await boot(page, base, 'fresh=1&t=0.42');
  await page.evaluate(HULL2);
  const ow = await page.evaluate(OPEN_WATER);
  // ghi lại lời gọi tiếng để đọc (không thay hành vi)
  await page.evaluate(o => {
    DR_DEBUG.teleport(o.x, o.z, o.yaw);
    window.__snd = [];
    for (const f of ['play', 'loop', 'stopLoop']) {
      const o = DRAudio[f];
      DRAudio[f] = function (k, v, r) { window.__snd.push({ f, k: DRAudio.resolve(k) || k, v, r, t: performance.now() }); return o.apply(this, arguments); };
    }
  }, ow);
  await page.mouse.move(W / 2, H / 2 + 300);
  await page.mouse.click(W / 2, H / 2 + 300);    // mở WebAudio (luật autoplay)
  await sleep(300);

  // ---- thanh năng lực ----
  let d = await ab();
  check('vào biển: thanh năng lực hiện, chọn sẵn nêm 0 = lights', await page.isVisible('#dr-ab .ab-icon') && d.selected === 'lights', d.selected);
  const wedges = await page.evaluate(() => DRAbilities.wedges());
  check('11 nêm theo thứ tự abilityWedges gốc', wedges.join(',') === 'lights,foghorn,spyglass,pot,trawl,bait,haste,atrophy,banish,manifest,camera', wedges.join(','));
  await shot('1-bar');

  // ---- L không còn bật đèn ----
  await page.evaluate(() => DR_DEBUG.give('light1'));
  await sleep(200);
  await page.keyboard.press('KeyL');
  await sleep(200);
  check('L không bật đèn (L gốc = Bách khoa)', !(await page.evaluate(() => DR.s.lightsOn)));
  check('L mở Bách khoa', await page.evaluate(() => !!(window.DRBook && DRBook.isOpen())));
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Esc đóng Bách khoa, giờ chạy lại', await page.evaluate(() => !DRBook.isOpen() && (DR.timeScale == null || DR.timeScale === 1)));

  // ---- giữ E: vòng chọn, time scale 0,3 ----
  await page.keyboard.down('KeyW');
  await sleep(1500);
  const rate = async () => { const t0 = await page.evaluate(() => [DR.s.time, performance.now()]); await sleep(1200); const t1 = await page.evaluate(() => [DR.s.time, performance.now()]); return (t1[0] - t0[0]) / (t1[1] - t0[1]); };
  const r1 = await rate();
  await page.keyboard.down('KeyE');
  await sleep(450);
  d = await ab();
  check('giữ E: vòng chọn mở, DR.timeScale = 0,3', d.radialOpen && near(d.timeScale, 0.3, 1e-9), JSON.stringify({ open: d.radialOpen, ts: d.timeScale }));
  check('vòng chọn hiện trên màn', await page.isVisible('#dr-ab .ab-radial.on'));
  const r2 = await rate();
  check('giờ game trôi chậm 0,3× khi vòng mở (main.js nhân dt)', near(r2 / r1, 0.3, 0.06), (r2 / r1).toFixed(3));
  // ---- góc chuột chọn nêm ----
  let p = wedgePoint(W, H, 2, 11);
  await page.mouse.move(p[0], p[1], { steps: 4 });
  await sleep(150);
  d = await ab();
  check('chuột ở góc nêm 2 (65,5°): chọn spyglass', d.radialIndex === 2 && d.selected === 'spyglass', d.radialIndex + ' ' + d.selected);
  p = wedgePoint(W, H, 1, 11);
  await page.mouse.move(p[0], p[1], { steps: 4 });
  await sleep(150);
  d = await ab();
  check('chuột ở góc nêm 1 (32,7°): chọn foghorn', d.radialIndex === 1 && d.selected === 'foghorn', d.radialIndex + ' ' + d.selected);
  p = wedgePoint(W, H, 6, 11);
  await page.mouse.move(p[0], p[1], { steps: 4 });
  await sleep(150);
  d = await ab();
  check('nêm 6 (haste) chưa mở khoá: con trỏ tới nêm nhưng năng lực giữ nguyên foghorn', d.radialIndex === 6 && d.selected === 'foghorn', d.radialIndex + ' ' + d.selected);
  const title = await page.textContent('#dr-ab .ab-title');
  check('nêm chưa mở khoá: tên ???', title === '???', title);
  p = wedgePoint(W, H, 0, 11);
  await page.mouse.move(p[0], p[1], { steps: 4 });
  await sleep(200);
  await shot('2-radial');
  await page.keyboard.up('KeyE');
  await sleep(200);
  d = await ab();
  check('thả E: vòng đóng, timeScale 1, chọn lights', !d.radialOpen && d.timeScale === 1 && d.selected === 'lights', JSON.stringify({ open: d.radialOpen, ts: d.timeScale, sel: d.selected }));
  await page.keyboard.up('KeyW');
  const snd0 = await page.evaluate(() => window.__snd.map(s => s.k));
  check('tiếng vòng chọn: Appear + Select', snd0.includes('ui.radial.appear') && snd0.includes('ui.radial.select'), [...new Set(snd0.filter(k => /radial/i.test(k)))].join(','));

  // ---- Đèn: chuột phải ----
  const right = async (ms) => { await page.mouse.down({ button: 'right' }); await sleep(ms || 60); await page.mouse.up({ button: 'right' }); await sleep(150); };
  await right();
  let L = await page.evaluate(() => ({ on: DR.s.lightsOn, spot: DRBoat.lights.spot.intensity, range: DRBoat.lights.spot.distance, lumens: DRBoat.stats.lumens, n: DRBoat.lights.spots.length }));
  check('chuột phải với Đèn: bật', L.on, JSON.stringify(L));
  check('một đèn pha duy nhất, cường độ = 500 lm × 0,02 = 10, tầm 10 m (light1)', L.n === 1 && near(L.spot, 10, 1e-9) && L.range === 10, JSON.stringify(L));
  await page.evaluate(() => DR_DEBUG.give('light2'));
  await sleep(250);
  L = await page.evaluate(() => ({ spot: DRBoat.lights.spot.intensity, range: DRBoat.lights.spot.distance, lumens: DRBoat.stats.lumens }));
  check('thêm light2: cường độ = (500 + 750) × 0,02 = 25, tầm = max(10, 20) = 20', near(L.spot, 25, 1e-9) && L.range === 20, JSON.stringify(L));
  const beam = await page.evaluate(() => { let n = 0, vis = 0; DRBoat.model.traverse(o => { if (o.isMesh && o.material && o.material.uniforms && o.material.uniforms.uFade) { n++; let v = true; for (let q = o; q; q = q.parent) v = v && q.visible; if (v) vis++; } }); return { n, vis }; });
  check('nón sáng = mesh Beam thật của prefab, hiện khi bật', beam.n > 0 && beam.vis > 0, JSON.stringify(beam));
  await right();
  check('chuột phải lần 2: tắt đèn', !(await page.evaluate(() => DR.s.lightsOn)));

  // ---- Còi sương ----
  p = wedgePoint(W, H, 1, 11);
  await page.keyboard.down('KeyE'); await sleep(250);
  await page.mouse.move(p[0], p[1], { steps: 3 }); await sleep(120);
  await page.keyboard.up('KeyE'); await sleep(150);
  check('chọn foghorn qua vòng', (await ab()).selected === 'foghorn');
  await page.evaluate(() => { window.__snd = []; });
  await page.mouse.down({ button: 'right' });
  await sleep(700);
  d = await ab();
  const loops = await page.evaluate(() => window.__snd.filter(s => s.f === 'loop' && s.k === 'boat.horn.loop'));
  check('giữ chuột phải: còi bật, vòng lặp foghorn-loop chạy', d.active.includes('foghorn') && loops.length > 5, 'lời gọi loop=' + loops.length);
  check('sau 0,08 s: âm lượng 1, cao độ 1,1 − 0,1 = 1,0', near(d.foghorn.vol, 1, 1e-6) && near(d.foghorn.rate, 1, 1e-6), JSON.stringify(d.foghorn));
  check('lần gọi đầu: âm lượng 0,5, cao độ 1,1', loops.length && near(loops[0].v, 0.5, 0.02) && near(loops[0].r, 1.1, 0.02), loops.length ? loops[0].v.toFixed(3) + ' / ' + loops[0].r.toFixed(3) : '');
  await page.mouse.up({ button: 'right' });
  await sleep(200);
  d = await ab();
  const end = await page.evaluate(() => window.__snd.filter(s => s.k === 'boat.horn.end' || s.f === 'stopLoop'));
  const endPlay = end.find(s => s.f === 'play' && s.k === 'boat.horn.end');
  check('thả: còi tắt, dừng vòng lặp, phát foghorn-end (0,5, cao độ 1,0)', !d.active.includes('foghorn') && end.some(s => s.f === 'stopLoop' && s.k === 'boat.horn.loop') && endPlay && near(endPlay.v, 0.5, 1e-6) && near(endPlay.r, 1, 1e-6), JSON.stringify(end.map(s => s.f + ':' + s.k)));

  // ---- Tăng tốc ----
  await page.evaluate(() => {
    DRAbilities.unlock('haste', true);
    // ô trang bị chỉ hỏng được khi đã mở bến Thợ đóng tàu (GridCellData.CanDamageThisCell)
    DR.s.availableDestinations = (DR.s.availableDestinations || []).concat(['destination.gm-shipwright']);
  });
  await page.evaluate(o => DR_DEBUG.teleport(o.x, o.z, o.yaw), ow);
  p = wedgePoint(W, H, 6, 11);
  await page.keyboard.down('KeyE'); await sleep(250);
  await page.mouse.move(p[0], p[1], { steps: 3 }); await sleep(120);
  await page.keyboard.up('KeyE'); await sleep(300);
  check('chọn haste qua vòng (sau khi mở khoá); thanh nhiệt hiện', (await ab()).selected === 'haste' && await page.isVisible('#dr-ab .ab-heat'));
  // tốc độ chạy đều không tăng tốc
  await page.keyboard.down('KeyW');
  await sleep(4000);
  const v0 = await page.evaluate(() => DRBoat.speed());
  const eng0 = await page.evaluate(() => { const inv = DR.grid('INVENTORY'); const e = inv.items.find(i => i.id === 'engine1'); return { dmg: inv.damage.length, onDmg: DRGrid.onDamaged(inv, e) }; });
  await page.mouse.down({ button: 'right' });
  await sleep(40);
  const h0 = (await ab()).haste;
  await sleep(1400);
  const h1 = (await ab()).haste;
  check('giữ chuột phải: lúc đầu lực × boostAmount(0)·1,3 ≈ 1,95', h0.speed > 1.8 && h0.speed <= 1.95 + 1e-6, h0.speed.toFixed(3) + ' giữ ' + h0.hold.toFixed(2) + ' s');
  check('sau 0,5 s: lực × 1,0·1,3 = 1,3', near(h1.speed, 1.3, 1e-6), h1.speed.toFixed(4));
  await sleep(1600);
  const v1 = await page.evaluate(() => DRBoat.speed());
  check('tốc độ đều tăng ≈ 1,3× (cản tuyến tính)', near(v1 / v0, 1.3, 0.08), v0.toFixed(2) + ' → ' + v1.toFixed(2) + ' m/s (' + (v1 / v0).toFixed(3) + '×)');
  const fov = await page.evaluate(() => DRCamera.cam.fov);
  check('FOV tăng về 50 (hasteFOV)', fov > 48 && fov <= 50.0001, fov.toFixed(2));
  await shot('3-haste');
  // nhiệt tới trần 8 ⇒ nổ một lần, hỏng ô máy
  await page.waitForFunction(() => DRAbilities.debug().haste.explosions >= 1, null, { timeout: 15000 }).catch(() => {});
  const h2 = (await ab()).haste;
  const eng1 = await page.evaluate(() => { const inv = DR.grid('INVENTORY'); const e = inv.items.find(i => i.id === 'engine1'); return { dmg: inv.damage.length, onDmg: DRGrid.onDamaged(inv, e), cell: inv.damage[inv.damage.length - 1], at: [e.x, e.y] }; });
  check('nhiệt đầy (8) ⇒ nổ đúng 1 lần, nghỉ 0,5 s', h2.explosions === 1, JSON.stringify(h2));
  check('nổ: thêm đúng 1 ô hỏng, nằm trên máy engine1 (trước đó lành)', !eng0.onDmg && eng1.dmg === eng0.dmg + 1 && eng1.onDmg, JSON.stringify({ eng0, eng1 }));
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('KeyW');
  await sleep(1200);
  d = await ab();
  check('thả: tắt tăng tốc, lực về 1, FOV về 40', !d.active.includes('haste') && d.haste.speed === 1 && near(await page.evaluate(() => DRCamera.cam.fov), 40, 0.6), d.haste.speed + ' / ' + (await page.evaluate(() => DRCamera.cam.fov)).toFixed(2));

  // ---- Ống nhòm ----
  const setup = await page.evaluate(() => {
    // tìm điểm câu có nước thoáng 60 m phía trước theo một hướng nào đó
    for (const sp of DRSpots.list) {
      if (Math.hypot(sp.x - 20, sp.z + 30) > 400) continue;
      for (let a = 0; a < 6.283; a += 0.3927) {
        const bx = sp.x + Math.sin(a) * 60, bz = sp.z + Math.cos(a) * 60;
        let ok = DR_DEBUG.sdf(bx, bz) > 8;
        for (let t = 0.05; ok && t < 1; t += 0.05) ok = DR_DEBUG.sdf(bx + (sp.x - bx) * t, bz + (sp.z - bz) * t) > 1;
        if (!ok) continue;
        // mũi thuyền three.js = (−sin yaw, −cos yaw); hướng tới điểm = (−sin a, −cos a) ⇒ yaw = a
        return { id: sp.id, x: sp.x, z: sp.z, bx, bz, yaw: a };
      }
    }
    return null;
  });
  check('tìm được điểm câu thoáng 60 m để thử ống nhòm', !!setup, JSON.stringify(setup));
  if (setup) {
    await page.evaluate(s => { DR_DEBUG.teleport(s.bx, s.bz, s.yaw); DRCamera.snap(); }, setup);
    await sleep(800);
    p = wedgePoint(W, H, 2, 11);
    await page.keyboard.down('KeyE'); await sleep(250);
    await page.mouse.move(p[0], p[1], { steps: 3 }); await sleep(120);
    await page.keyboard.up('KeyE'); await sleep(200);
    await page.mouse.move(W / 2, H / 2, { steps: 2 });
    await right();
    await sleep(700);
    // POV dọc: 0,05°/px (InControl 0,05 × baseSensitivityY 2 × 0,5); rê xuống 50 px ⇒ cúi thêm 2,5° để tia chạm capsule của điểm
    await page.mouse.move(W / 2, H / 2 + 50, { steps: 5 });
    await sleep(400);
    d = await ab();
    const cam = await page.evaluate(() => ({ fov: DRCamera.cam.fov, y: DRCamera.cam.position.y, by: DRBoat.root.position.y, dx: DRCamera.cam.position.x - DRBoat.root.position.x, dz: DRCamera.cam.position.z - DRBoat.root.position.z }));
    check('chuột phải với Ống nhòm: camera POV FOV 15, cao +3 m ngay trên thuyền', d.active.includes('spyglass') && near(cam.fov, 15, 1e-6) && near(cam.y - cam.by, 3, 0.05) && Math.hypot(cam.dx, cam.dz) < 0.05, JSON.stringify(cam));
    check('rê chuột xuống 50 px: POV dọc 0,5° → 3,0°', near(d.spyglass.v, 3, 0.05), d.spyglass.v.toFixed(3));
    check('tia nhìn trúng điểm câu phía trước (lệch < 5°, trong 200 m)', d.spyglass.focus === setup.id, d.spyglass.focus + ' / mong ' + setup.id);
    const info = await page.evaluate(() => { const e = document.querySelector('#dr-ab .ab-info'); const r = e.getBoundingClientRect(); return { op: +getComputedStyle(e).opacity, cx: (r.left + r.right) / 2, bottom: r.bottom }; });
    check('bảng tin điểm câu hiện, neo giữa màn theo hướng nhìn', info.op > 0.9 && Math.abs(info.cx - W / 2) < 200, JSON.stringify(info));
    await shot('4-spyglass');
    await right();
    await sleep(800);
    d = await ab();
    check('chuột phải lần 2: thoát ống nhòm, camera về FOV 40', !d.active.includes('spyglass') && near(await page.evaluate(() => DRCamera.cam.fov), 40, 0.01));
  }

  // ---- Lưới kéo trên đuôi thuyền + mở khoá trawl ----
  const net = await page.evaluate(() => {
    const vis = p => { let o = DRBoat.model.getObjectByName('Boat2'); for (const n of p.split('/')) o = o && o.children.find(c => c.name === n || c.userData.name === n); let v = !!o; for (let q = o; q; q = q.parent) v = v && q.visible; return v; };
    const eq = DR_BOAT.tierEquipment.Boat2.net, before = { trawl: vis(eq.trawl), ab: !!DR.s.abilities.trawl };
    // ô lưới 2×2 của Tier2Hull trùng ô cần câu: cất cần, đặt lưới, cho cần lại
    const inv = DR.grid('INVENTORY');
    for (const i of inv.items.filter(i => i.id === 'rod1')) DRGrid.remove(inv, i);
    DR_DEBUG.give('net1'); DR_DEBUG.give('rod1');
    const after = { kind: DRBoat.netKind, trawl: vis(eq.trawl), iron: vis(eq.ironhaven), salvage: vis(eq.salvage), ab: !!DR.s.abilities.trawl };
    return { before, after, paths: eq };
  });
  check('chưa có lưới: không thấy lưới; có net1: TrawlNet hiện, hai loại kia ẩn', !net.before.trawl && net.after.kind === 'trawl' && net.after.trawl && !net.after.iron && !net.after.salvage, JSON.stringify(net));
  check('lưới đầu tiên vào khoang mở khoá năng lực trawl (ItemLogicHandler)', !net.before.ab && net.after.ab);
  await page.evaluate(o => DR_DEBUG.teleport(o.x, o.z, o.yaw), ow);
  await sleep(700);
  await shot('5-net');

  // ---- đêm, bật Đèn (so với gog_16: nón sáng hẹp phía mũi) ----
  await page.evaluate(o => { DR_DEBUG.setTime(0.92); DR_DEBUG.teleport(o.x, o.z, o.yaw); DRCamera.snap(); }, ow);
  p = wedgePoint(W, H, 0, 11);
  await page.keyboard.down('KeyE'); await sleep(250);
  await page.mouse.move(p[0], p[1], { steps: 3 }); await sleep(120);
  await page.keyboard.up('KeyE'); await sleep(200);
  await right();
  await sleep(1500);
  check('đêm: chọn Đèn qua vòng rồi chuột phải = bật', await page.evaluate(() => DR.s.lightsOn && DRAbilities.selected() === 'lights'));
  await shot('6-night-lights');

  // ---- mô hình trang bị khác (BoatSubModelToggler) và chỉ số hiển thị ----
  const tog = await page.evaluate(() => {
    const visN = p => { let o = DRBoat.model.getObjectByName('Boat2'); for (const n of p.split('/')) o = o && o.children.find(c => c.name === n || c.userData.name === n); let v = !!o; for (let q = o; q; q = q.parent) v = v && q.visible; return v; };
    const eq = DR_BOAT.tierEquipment.Boat2, r = {};
    // GR-16 đèn cải tiến: EnhancedLights hiện theo số đèn, Light0 ×4 cường độ, ×1,25 tầm
    DRBoat.setLights(true);
    r.p0 = [DRBoat.lights.point.intensity, DRBoat.lights.point.distance];
    DRAbilities.unlock('lights-advanced', true);
    r.p1 = [DRBoat.lights.point.intensity, DRBoat.lights.point.distance];
    r.enh = eq.advancedLights.map(visN);
    DRBoat.setLights(false);
    // GR-15 phá băng theo biến SetIcebreakerEquipped
    r.ice0 = visN(eq.icebreaker[0]);
    DR.s.vars['icebreaker-equipped'] = true; DRBoat.refresh();
    r.ice1 = visN(eq.icebreaker[0]);
    // GR-14 thùng cá = ceil(11 · ô cá / ô không ẩn)
    const inv = DR.grid('INVENTORY');
    let cells = 0; for (const c of inv.cells) if (c && !c.hidden) cells++;
    const fish = DR.give('cod'), nf = fish ? (DR_ITEMS.cod.dims || [[0, 0]]).length : 0;
    DRBoat.refresh();
    r.crates = eq.fishContainers.filter(visN).length; r.cratesWant = Math.ceil(eq.fishContainers.length * nf / cells); r.cells = cells; r.nf = nf;
    // GR-09 khói hỏng nặng: số ô hỏng = DamageThreshold ⇒ mesh hỏng cuối + HullCriticalEffects
    const th = DRRules.damageThreshold(DR_CONFIG, DR.s.hullTier);
    while (inv.damage.length < th) DRGrid.addDamage(inv, DR_ITEMS, true);
    DRBoat.refresh();
    r.th = th; r.critical = DRBoat.critical; r.mesh = DRBoat.damageMesh; r.meshLast = (DR_BOAT.tiers[1].damageNodes || []).length;
    inv.damage.length = 0; DRBoat.refresh(); r.critical2 = DRBoat.critical;
    // GR-08 tốc độ câu hiển thị = FishingSpeedModifier thô (1,1 ⇒ 110 %), minigame giữ đường cong
    const st = DRRules.stats(Object.assign({}, DR_CONFIG, { baseFishingSpeedModifier: 1.1 }), { items: [], cells: [], damage: [] }, DR_ITEMS);
    r.fd = [st.fishingDisplay, st.fishing];
    return r;
  });
  check('GR-16 đèn cải tiến: Light0 ×4 cường độ, ×1,25 tầm; EnhancedLights hiện theo 2 đèn', near(tog.p1[0], tog.p0[0] * 4, 1e-9) && near(tog.p1[1], tog.p0[1] * 1.25, 1e-9) && tog.enh.every(Boolean), JSON.stringify({ p0: tog.p0, p1: tog.p1, enh: tog.enh }));
  check('GR-15 phá băng: ẩn → hiện khi icebreaker-equipped', !tog.ice0 && tog.ice1);
  check('GR-14 thùng cá = ceil(11 · ô cá / ô dùng được)', tog.nf > 0 && tog.crates === tog.cratesWant, JSON.stringify({ crates: tog.crates, want: tog.cratesWant, nf: tog.nf, cells: tog.cells }));
  check('GR-09 đủ DamageThreshold ô hỏng ⇒ mesh hỏng cuối + HullCriticalEffects; sửa xong thì tắt', tog.critical && tog.mesh === tog.meshLast && !tog.critical2, JSON.stringify({ th: tog.th, crit: tog.critical, mesh: tog.mesh, last: tog.meshLast }));
  check('GR-08 modifier 1,1: fishingDisplay 1,1 (hiện 110 %), fishing = 1,1^0,45 cho minigame', near(tog.fd[0], 1.1, 1e-12) && near(tog.fd[1], Math.pow(1.1, 0.45), 1e-12), JSON.stringify(tog.fd));

  check('không có pageerror / console error / HTTP >= 400', errors.length === 0, errors.slice(0, 5).join(' | '));
  const miss = await page.evaluate(() => DRAbilities.missingSounds());
  out.push('  · tiếng chưa ship (tên gốc): ' + (miss.length ? miss.join(', ') : 'không'));
  await page.close();
}

// ---- màn điện thoại ngang: thanh năng lực, vòng chọn (chạm) và đèn đêm ----
async function phone(browser, base) {
  const W = 844, H = 390;
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true });
  const errors = watch(page);
  const shot = name => page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-' + name + '.png') });
  await boot(page, base, 'fresh=1&t=0.9');
  await page.evaluate(HULL2);
  const ow = await page.evaluate(OPEN_WATER);
  await page.evaluate(o => { DR_DEBUG.teleport(o.x, o.z, o.yaw); DR_DEBUG.give('light1'); DR_DEBUG.give('light2'); }, ow);
  await sleep(600);
  const icon = await page.evaluate(() => { const r = document.querySelector('#dr-ab .ab-icon').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
  check('844×390: ô năng lực nằm trong màn', icon.x > 0 && icon.y < H && icon.w > 20, JSON.stringify(icon));
  await page.touchscreen.tap(icon.x, icon.y);
  await sleep(300);
  check('844×390: chạm ô năng lực (Đèn) = bật đèn', await page.evaluate(() => DR.s.lightsOn));
  await sleep(500);
  await shot('1-night-lights');
  const rp = await page.evaluate(() => { const r = document.querySelector('#dr-ab .ab-rp').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(rp.x, rp.y);
  await sleep(500);
  check('844×390: chạm nhãn vòng chọn = mở vòng', (await page.evaluate(() => DRAbilities.debug())).radialOpen);
  await shot('2-radial');
  check('844×390: không lỗi', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  console.log('DREDGE gear — ' + base);
  try {
    out.push('\n[1920x1080]'); await run(browser, base);
    out.push('\n[844x390]'); await phone(browser, base);
  } catch (e) { check('chạy hết kịch bản', false, e.stack || e.message); }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\nẢnh: ' + SHOTS);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
