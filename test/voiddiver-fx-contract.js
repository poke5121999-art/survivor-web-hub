/*
 * VOID DIVER — hợp đồng hiển thị kỹ năng (VFX + anim) chạy trên trang thật, bước khung tất định.
 * Sinh ra 2026-09-25: chủ dự án "tung skill không thấy xích bay ra, bùa bay ra". Số trước bản sửa đo bằng probe cùng kịch bản
 * (chưa chạy chính tệp này trên mã cũ):
 *   - VFX của hitbox phải bay theo hitbox (trước: đứng yên chỗ phát, stage.js bỏ cờ tracking)
 *   - xích Gayoung (ChainSkillVfx, MeshRenderer) phải hiện và kéo dài (trước: không vẽ MeshRenderer)
 *   - lần tung đầu không khựng (trước: 137–185 ms một khung vì biên dịch shader lúc phát)
 *   - ngắm quanh phương thẳng đứng không lật hình mỗi khung (trước: 7 lần lật / 60 khung)
 *   - boomerang Mio (MoveType TraceOwner) phải quay về (trước: bay mãi)
 *
 * Chạy:  node test/voiddiver-fx-contract.js
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.atlas': 'text/plain', '.css': 'text/css', '.woff2': 'font/woff2' };

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : '')); };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// Mở sandbox, dừng vòng lặp, đặt nhân vật vào chỗ trống, cài bộ ghi VFX + hàm bước khung.
async function open(browser, base, char) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [], bad = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(/^.*\/games\/voiddiver\//, '')); });
  await page.goto(base + '/games/voiddiver/index.html?sandbox=1&sectors=1001&char=' + char + '&mons=200011x2');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
  await page.evaluate(() => {
    VD.loop.stop();
    const S = VD.stage, W = VD.world, p0 = S.player.pos;
    let best = null;
    for (let r = 0; r < 25 && !best; r += 0.5) for (let a = 0; a < 24 && !best; a++) {
      const x = p0.x + Math.cos(a / 24 * 6.283) * r, z = p0.z + Math.sin(a / 24 * 6.283) * r;
      let ok = true;
      for (let rr = 0; rr <= 4.5 && ok; rr += 0.75) for (let k = 0; k < 12 && ok; k++) if (W.overlapsMove(x + Math.cos(k / 12 * 6.283) * rr, z + Math.sin(k / 12 * 6.283) * rr, 0.3)) ok = false;
      if (ok) best = { x, z };
    }
    if (best) { p0.x = best.x; p0.z = best.z; }
    VD.render.snap(p0);
    VD.loop.render(1 / 60);
    window.__vfx = [];
    const orig = VD.vfx.play;
    VD.vfx.play = function (name, o) {
      const h = orig.apply(this, arguments);
      window.__vfx.push({ name, h, tracking: !!(o && o.tracking), p0: null, maxD: 0, chainLs: 0, meshVis: false });
      return h;
    };
    window.__stext = [];
    if (VD.hud && VD.hud.statusText) { const st = VD.hud.statusText; VD.hud.statusText = function (u, t) { window.__stext.push(t); return st.apply(this, arguments); }; }
    window.__maxMs = 0;
    window.__step = n => {
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        VD.loop.time += 1 / 60; VD.loop.frame++;
        VD.loop.update(1 / 60); VD.input.endFrame(); VD.loop.render(1 / 60);
        window.__maxMs = Math.max(window.__maxMs, performance.now() - t0);
        for (const r of window.__vfx) {
          const fx = r.h && r.h.fx; if (!fx) continue;
          if (!r.p0) r.p0 = fx.rootPos.clone();
          r.maxD = Math.max(r.maxD, fx.rootPos.distanceTo(r.p0));
          if (fx.meshObjs) for (const o of fx.meshObjs) if (o.visible) r.meshVis = true;
          const sc = fx.tp && fx.tp.script;
          if (sc && fx.ls && sc.chain >= 0) r.chainLs = Math.max(r.chainLs, fx.ls[sc.chain * 3 + 2]);
        }
      }
    };
    window.__aimAt = (dist, deg) => {
      const S = VD.stage, p = S.player.pos, ax = VD.render.screenAxes();
      VD.render.camera.updateMatrixWorld();
      const a = deg * Math.PI / 180, sx = Math.cos(a), sy = Math.sin(a);
      const dx = ax.right.x * sx + ax.fwd.x * sy, dz = ax.right.z * sx + ax.fwd.z * sy, l = Math.hypot(dx, dz);
      const v = new THREE.Vector3(p.x + dx / l * dist, 0.5, p.z + dz / l * dist).project(VD.render.camera);
      const c = VD.render.renderer.domElement;
      VD.input.mouse.x = (v.x + 1) / 2 * c.clientWidth; VD.input.mouse.y = (1 - v.y) / 2 * c.clientHeight; VD.input.mouse.inside = true;
    };
  });
  return { page, errs, bad };
}
const step = (page, n) => page.evaluate(n => window.__step(n), n);
async function press(page, action, hold) {
  await page.evaluate(a => VD.input.down(a), action);
  await step(page, hold);
  await page.evaluate(a => VD.input.up(a), action);
}

async function gayoung(browser, base) {
  const { page, errs } = await open(browser, base, 100001);
  // Nạp trước: VFX của kỹ năng phải nạp xong trước lần tung đầu (không chặn lúc sinh)
  const pre = await page.waitForFunction(() => VD.vfx.isLoaded('1001/1001_02_SwordSkill_01_Chain'), null, { timeout: 30000 }).then(() => true, () => false);
  check('[Gayoung] VFX xích được nạp trước khi tung', pre);
  await step(page, 3);   // một khung để hàng "vẽ khống" chạy
  await page.evaluate(() => { window.__maxMs = 0; window.__aimAt(3.2, 200); });
  await step(page, 2);
  await press(page, 'SkillOne', 12);
  await step(page, 50);
  const chain = await page.evaluate(() => {
    const r = window.__vfx.filter(v => /SwordSkill_01_Chain$/.test(v.name));
    return { n: r.length, vis: r.some(v => v.meshVis), ls: Math.max(0, ...r.map(v => v.chainLs)), ms: +window.__maxMs.toFixed(1) };
  });
  check('[Gayoung] xích (MeshRenderer) hiện', chain.n > 0 && chain.vis, JSON.stringify(chain));
  check('[Gayoung] xích kéo dài theo khoảng cách tay → hitbox', chain.ls > 0.2, 'scale z ' + chain.ls.toFixed(2));
  // ngưỡng 80 ms: không có trong bảng — trước bản sửa đo 137–185 ms, sau 9 ms (máy dựng hình phần mềm của trình duyệt headless)
  check('[Gayoung] lần tung đầu không khựng vì biên dịch shader', chain.ms < 80, chain.ms + ' ms');
  // Bùa (Q): VFX tracking phải bay theo hitbox
  await step(page, 60);
  await page.evaluate(() => window.__aimAt(5, 200));
  await press(page, 'SkillTwo', 10);
  await step(page, 60);
  const tal = await page.evaluate(() => window.__vfx.filter(v => v.tracking && /Projectile/.test(v.name)).map(v => [v.name.split('/').pop(), +v.maxD.toFixed(2)]));
  check('[Gayoung] VFX đạn (tracking) bay theo hitbox', tal.some(x => x[1] > 1.5), JSON.stringify(tal));
  // Hướng nhìn: quét ngắm 80–100° quanh phương thẳng đứng, không được lật qua lại
  await step(page, 40);
  const flips = await page.evaluate(() => {
    const v = VD.stage.vis.get(VD.stage.player.uid);
    let n = 0, last = null;
    for (let i = 0; i < 60; i++) {
      window.__aimAt(2, 90 + 10 * Math.sin(i / 3));
      window.__step(1);
      if (last !== null && v.flip !== last) n++;
      last = v.flip;
    }
    return n;
  });
  check('[Gayoung] ngắm gần thẳng đứng không lật hình liên tục', flips <= 1, flips + ' lần lật / 60 khung');
  // Orbital velocity của hệ mô phỏng trong thế giới phải quay quanh gốc hệ, không quay quanh (0,0,0) của bản đồ.
  // Trước bản sửa: FireSparks của Purification phát ở (22, 0, −12) bay xa 20–25 m, thành đĩa trắng trôi trên màn hình.
  await page.evaluate(() => VD.vfx.preload(['Purification']));
  await page.waitForFunction(() => VD.vfx.isLoaded('Purification'), null, { timeout: 30000 });
  const orb = await page.evaluate(() => {
    const p = VD.stage.player.pos, at = { x: p.x, y: 0.5, z: p.z };
    VD.vfx.play('Purification', { pos: at });
    window.__step(24);
    const o = VD.render.scene.getObjectByName('vfx').children.find(c => c.name === 'vfx:FireSparks' && c.visible);
    if (!o) return null;
    const G = o.geometry, P = G.getAttribute('iPos').array;
    let far = 0;
    for (let i = 0; i < G.instanceCount; i++) far = Math.max(far, Math.hypot(P[i * 4] - at.x, P[i * 4 + 1] - at.y, P[i * 4 + 2] - at.z));
    return { n: G.instanceCount, far: +far.toFixed(2) };
  });
  // 3 m: không có trong bảng — tốc độ đầu 7–15 m/s bị Limit Velocity (dampen 0.5, mag 0.5) hãm trong vài khung
  check('[vfx] hạt orbital (không gian thế giới) ở gần chỗ phát', !!orb && orb.n > 0 && orb.far < 3, JSON.stringify(orb));
  // Chữ trạng thái nổi (StatusEffectText): quái vào đèn nhận buff EffectTag Light → "Thanh Tẩy" (ảnh gốc ss03 "Purify")
  await page.evaluate(() => {
    // đặt một quái ngay trong nón đèn pin (hướng ngắm 200° màn hình, 2 m) rồi chạy tiếp
    const S = VD.stage, p = S.player.pos, ax = VD.render.screenAxes(), a = 200 * Math.PI / 180;
    const dx = ax.right.x * Math.cos(a) + ax.fwd.x * Math.sin(a), dz = ax.right.z * Math.cos(a) + ax.fwd.z * Math.sin(a), l = Math.hypot(dx, dz);
    const m = S.units.find(u => u.kind === 'mon' && !u.dead);
    if (m) { m.pos.x = p.x + dx / l * 2; m.pos.z = p.z + dz / l * 2; }
    window.__aimAt(3, 200);
    window.__step(90);
  });
  const st = await page.evaluate(() => ({ list: [...new Set(window.__stext)], want: VD.TEXT.EStatusEffectTag_Light, dom: document.querySelectorAll('.vd-stext').length, light: VD.stage.units.filter(u => u.kind === 'mon').map(m => [m.buffs.stacks(3000002), +Math.hypot(m.pos.x - VD.stage.player.pos.x, m.pos.z - VD.stage.player.pos.z).toFixed(1), m.aiState]) }));
  check('[hud] quái vào đèn hiện chữ trạng thái Thanh Tẩy', st.list.includes(st.want), JSON.stringify(st));
  check('[Gayoung] không pageerror', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.close();
}

async function mio(browser, base) {
  const { page, errs } = await open(browser, base, 100004);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__aimAt(3, 200));
  await step(page, 2);
  // boomerang: khoảng cách hitbox → người chơi phải tăng rồi giảm về gần 0 (TraceOwner)
  await page.evaluate(() => VD.input.down('SkillOne'));
  const d = await page.evaluate(() => {
    const S = VD.stage, out = [];
    for (let i = 0; i < 150; i++) {
      if (i === 4) VD.input.up('SkillOne');
      window.__step(1);
      const p = S.player.pos, hs = (S.A.hitboxes || []).filter(h => h.owner === S.player && h.info && +h.info.moveSpeed > 0);
      out.push(hs.length ? Math.max(...hs.map(h => Math.hypot(h.pos.x - p.x, h.pos.z - p.z))) : -1);
    }
    return out;
  });
  const live = d.filter(x => x >= 0), far = Math.max(-1, ...live), iFar = d.indexOf(far);
  const after = d.slice(iFar), back = after.some(x => x === -1) || Math.min(...after.filter(x => x >= 0)) < 1;
  check('[Mio] boomerang bay ra', far > 2, 'xa nhất ' + far.toFixed(2) + ' m');
  check('[Mio] boomerang quay về người ném (TraceOwner)', far > 2 && back, JSON.stringify(d.filter((x, i) => i % 10 === 0).map(x => +x.toFixed(1))));
  check('[Mio] không pageerror', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.close();
}

// Tiếng trúng đòn theo nguyên tố: HitBox UseElementalHitSfx/UseElementalCritSfx → clip "<tên>_<nguyên tố>".
// Trước bản sửa: stage phát tên trần (không có clip) nên đánh thường trúng quái im lặng.
async function hitSfx(browser, base, char) {
  const { page, errs, bad } = await open(browser, base, char);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    VD.audio.unlock();
    const names = [], orig = VD.audio.sfx;
    VD.audio.sfx = function (n, o) { names.push(n); return orig.apply(this, arguments); };
    const S = VD.stage, p = S.player.pos, ax = VD.render.screenAxes();
    // quái đứng ngay trước mặt (theo hướng ngắm 200° màn hình) để mọi kiểu đánh thường đều trúng
    const a = 200 * Math.PI / 180, dx = ax.right.x * Math.cos(a) + ax.fwd.x * Math.sin(a), dz = ax.right.z * Math.cos(a) + ax.fwd.z * Math.sin(a), l = Math.hypot(dx, dz);
    S.units.filter(u => u.kind === 'mon').forEach((m, i) => { m.pos.x = p.x + dx / l * (1.3 + i * 0.3); m.pos.z = p.z + dz / l * (1.3 + i * 0.3); m.hp = m.maxHp = 1e6; });
    window.__aimAt(1.5, 200);
    VD.input.down('SkillBasicAttack');
    window.__step(200);
    VD.input.up('SkillBasicAttack');
    window.__step(30);
    return names;
  });
  await page.waitForTimeout(1500);   // chờ fetch clip xong để bắt 404
  const hit = r.filter(n => /_(None|Fire|Water|Wind)$/.test(n));
  check('[' + char + '] đánh thường trúng quái phát clip theo nguyên tố', hit.length > 0, [...new Set(r)].slice(0, 8).join(', '));
  const audio404 = bad.filter(x => /audio\//.test(x));
  check('[' + char + '] không clip tiếng nào 404 trong combo', audio404.length === 0, audio404.slice(0, 4).join(' | '));
  check('[' + char + '] không pageerror', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await gayoung(browser, base);
    await mio(browser, base);
    for (const c of [100001, 100003, 100004, 100005]) await hitSfx(browser, base, c);
  } catch (e) { check('chạy hết bài', false, e.message); }
  await browser.close(); srv.close();
  console.log('==> ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
