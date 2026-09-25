/*
 * HỐ XANH — kiểm khúc cano tự chạy (js/boat.js).
 *
 * Chạy:  node test/ho-xanh-boat.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-boat-shots) — mở ra xem bằng mắt.
 * Trang mở với ?boattrace=1: boat.js ghi từng khung của mỗi chuyến; mọi phép kiểm chuyến đọc từ trace sau khi chuyến xong,
 * nên máy bận (Playwright hỏi trễ, chụp ảnh lâu) không làm lỡ khung đầu hay khung Diveready.
 * Mặc định mở Chrome bằng GPU thật (ANGLE D3D11); SWIFTSHADER=1 để vẽ bằng phần mềm (chậm, chuyến ra ~2 phút).
 *
 * Chuyến cano là dãy đoạn (js/boat.js, TRIP) dựng từ chuyển động gốc trong khung camera sảnh gốc: chuyến ra rời bến quán
 * theo Lobby_GuestBoat01_Exit01, nối Dubins, cập chỗ lặn bằng Boat_Exit001 chạy lùi thời gian; chuyến về Respawn, rời chỗ
 * đậu bằng Boat_Exit002, nối Dubins, vào bến quán theo Lobby_GuestBoat01_Enter01. Kiểm ở 1280×720 và 844×390 (máy chạm):
 *  - t = 0 chuyến ra và cuối chuyến về: chiếu tâm quán lên màn hình, phải nằm trong khung; cano cách quán < 15 m;
 *  - khoảng cách cano → quán tăng dần suốt chuyến ra, giảm dần sau vòng quay đầu của chuyến về;
 *  - giữa các đoạn gốc (leave, depart, arrive về) vị trí khớp clip gốc < 0,1 m; tới chỗ lặn dừng đúng chỗ đậu gốc;
 *  - bấm phím không đổi gì; chuyến ra buổi chiều, chuyến về buổi tối;
 *  - tới nơi: Dave đi ra đuôi, Diveready tại chỗ, màn tối từ 60% clip, sang loading rồi dive; chuyến về xong thì sang kitchen;
 *  - nút "Bỏ qua" ở cả hai chiều, không có nút Ga/Phanh hay vùng kéo lái;
 *  - 5 chuyến liền nhau không làm tăng số geometry/texture của renderer;
 *  - không lỗi trang, không lỗi console, không 404.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-boat-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail != null && detail !== '' ? '  — ' + detail : ''));
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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// Tư thế gốc (hệ three) mà đoạn đang phát phải khớp, tính lại trong trang thẳng từ HX_BOAT_ASSETS (độc lập với boat.js):
//  - guest: đường thế giới của clip thuyền khách lobby.trip.guest[clip] ở giây from + t;
//  - clip tiến từ chỗ đậu (góc 0): chỗ đậu + posOffset(t) của Boat_Exit00x.
function expectedPoseExpr() {
  return (a) => {
    const B = window.HX_BOAT_ASSETS, TD = B.lobby.trip;
    const lerp = (x, y, k) => x + (y - x) * k, clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
    if (a.kind === 'guest') {
      const G = TD.guest[a.clip], f = clamp((a.from + a.t) * G.fps, 0, G.pos.length - 1), i = Math.floor(f), j = Math.min(G.pos.length - 1, i + 1), k = f - i;
      return [lerp(G.pos[i][0], G.pos[j][0], k), -lerp(G.pos[i][1], G.pos[j][1], k)];
    }
    const C = B.boat.anims[a.clip], P = C.tracks[''].posOffset, f = clamp(a.t * C.fps, 0, P.length - 1), i = Math.floor(f), j = Math.min(P.length - 1, i + 1), k = f - i;
    const M = B.sea.boatScene.pos;
    return [M[0] + lerp(P[i][0], P[j][0], k), -(M[2] + lerp(P[i][2], P[j][2], k))];
  };
}

// Chụp ảnh ở các mốc (tên đoạn + giây trong đoạn) bằng cách hỏi định kỳ. Chỉ để xem bằng mắt: mốc lỡ vì trễ thì bỏ,
// mọi phép kiểm đọc từ trace ghi trong trang (?boattrace=1), không từ lần hỏi này.
async function followShots(page, marks, shot) {
  const done = new Set();
  for (;;) {
    const i = await page.evaluate(() => HX.phases.boat.info());
    if (!i.active) return;
    for (const m of marks) {
      if (done.has(m.name)) continue;
      if (i.state === m.state && (i.seg ? i.seg.t : 0) >= (m.t || 0)) { done.add(m.name); await shot(m.name); }
    }
    if (done.size === marks.length) return;
    await sleep(100);
  }
}
function inFrame(ndc) { return !!ndc && Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1 && ndc[2] < 1; }
// Dãy khoảng cách tăng (dir 1) hay giảm (dir −1) đều, cho phép lệch ngược tol mét (lùi khỏi bến quán, vòng quay đầu)
function monotone(xs, dir, tol) {
  let worst = 0, best = xs[0];
  for (const x of xs) { if (dir > 0) { worst = Math.max(worst, best - x); best = Math.max(best, x); } else { worst = Math.max(worst, x - best); best = Math.min(best, x); } }
  return { ok: worst <= tol, worst };
}
// Mẫu mỗi step giây thời gian chuyến (tt) từ trace.
function every(frames, step) {
  const out = []; let next = 0;
  for (const f of frames) if (f.tt >= next) { out.push(f); next = f.tt + step; }
  return out;
}
const fmt = v => JSON.stringify(v && v.map(x => +x.toFixed(3)));

async function run(browser, base, W, H, touch) {
  const tag = W + 'x' + H;
  console.log('\n== ' + tag + (touch ? ' (chạm)' : '') + ' ==');
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: !!touch, isMobile: !!touch });
  const errors = watch(page);
  const B = () => page.evaluate(() => HX.phases.boat.info());
  const phase = p => page.waitForFunction(p => window.HX_DEBUG && HX_DEBUG.info().phase === p, p, { timeout: 120000 });
  const until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 120000, polling: 50 });
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  // trace của chuyến vừa xong (chuyến cuối trong danh sách boat.js ghi)
  const lastTrip = () => page.evaluate(() => { const t = HX.phases.boat.trace(); return t && t[t.length - 1]; });
  const expect = a => page.evaluate(expectedPoseExpr(), a);

  await page.goto(base + '/games/ho-xanh/index.html?fresh=1&route=A01,B01,C03&phase=boat&dir=out&boattrace=1', { timeout: 120000 });
  await until(() => window.HX && HX.phases.boat.info().loaded);
  // ghi lại mọi lần boat.js gọi G.go (loading có khi chỉ kéo dài một khung khi glb đã nạp sẵn)
  await page.evaluate(() => { window.__went = []; const go = HX.game.go; HX.game.go = function (n, a) { window.__went.push(n); return go(n, a); }; });
  const went = () => page.evaluate(() => window.__went.splice(0));
  check('trang mở với ?boattrace=1 thì boat.js ghi trace từng khung', await page.evaluate(() => Array.isArray(HX.phases.boat.trace && HX.phases.boat.trace())));
  let I = await B();
  check('vào pha boat chiều ra, tải xong cảnh', I.active && I.dir === 'out' && I.loaded, I.state);
  check('chuyến ra chạy buổi chiều', I.time === 'day', I.time);
  check('chuyến ra là dãy đoạn rev → leave (Exit01 thuyền khách) → cruise → arrive (Exit001 lùi thời gian)',
    I.segs.join(' ') === 'rev:hold leave:guest:Lobby_GuestBoat01_Exit01 cruise:link arrive:clip:Boat_Exit001', I.segs.join(' '));
  check('tiêu đề có "ra Hố Xanh"', (await page.textContent('#scr-boat h2')).includes('ra Hố Xanh'), await page.textContent('#scr-boat h2'));
  check('nút "Bỏ qua" đúng chữ', (await page.textContent('#boat-skip')) === 'Bỏ qua');
  check('quãng đường tới Hố Xanh hiện trên thanh tiến độ', /^\d+ m$/.test(await page.textContent('.bt-dist')), await page.textContent('.bt-dist'));
  check('không còn nút Ga/Phanh hay vùng kéo lái trong HUD', (await page.$$('.bt-ga, .bt-brake, .bt-steer')).length === 0);

  const outShots = followShots(page, [
    { name: '1-out-start', state: 'rev' }, { name: '2-out-leave', state: 'leave', t: 5 },
    { name: '3-out-cruise', state: 'cruise', t: 3 }, { name: '4-out-dive', state: 'dive' },
  ], shot);
  // bấm phím trong lúc chạy: không còn tác dụng gì (không nhận input lái nữa); kiểm bằng trace ở dưới
  await until(() => { const i = HX.phases.boat.info(); return !i.active || i.state === 'cruise'; });
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
  await sleep(400);
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyA');
  await phase('dive');
  await outShots;
  check('nhảy xong thì sang loading rồi vào lặn', JSON.stringify(await went()) === '["loading"]');
  let T = await lastTrip(), F = T.frames;
  check('trace chuyến ra: đủ khung từ đầu tới lúc sang loading', T.dir === 'out' && F.length > 100 && T.end === 'loading', F.length + ' khung, kết ' + T.end);
  let f0 = F[0];
  check('t = 0 chuyến ra (khung đầu): đoạn rev, quán nằm trong khung hình', f0.tt === 0 && f0.state === 'rev' && inFrame(f0.ndc), f0.state + ' tt ' + f0.tt + ' ndc ' + fmt(f0.ndc));
  check('t = 0 chuyến ra: cano đậu cạnh quán (< 15 m)', f0.dR < 15, f0.dR.toFixed(1) + ' m');
  let fm = F.find(f => f.seg === 'leave' && f.segT >= 3.75);
  let exp = await expect({ kind: 'guest', clip: 'Lobby_GuestBoat01_Exit01', from: 0, t: fm.segT });
  let err = Math.hypot(fm.x - exp[0], fm.z - exp[1]);
  check('giữa đoạn leave, vị trí khớp đường gốc Lobby_GuestBoat01_Exit01 (sai số < 0,1 m)', err < 0.1, 'lệch ' + err.toFixed(4) + ' m ở ' + fm.segT.toFixed(2) + ' s');
  const cruise = F.filter(f => f.state === 'cruise');
  check('bấm W/A lúc đang chạy: suốt đoạn cruise cano vẫn chạy (tốc độ > 1 m/s), thời gian chuyến tăng đều',
    cruise.length > 10 && cruise.every((f, k) => f.speed > 1 && (k === 0 || f.tt > cruise[k - 1].tt)), cruise.length + ' khung, tốc độ nhỏ nhất ' + Math.min(...cruise.map(f => f.speed)).toFixed(2));
  const fd = F.find(f => f.state === 'dive'), MO = await page.evaluate(() => { const p = HX_BOAT_ASSETS.sea.boatScene.pos; return [p[0], -p[2]]; });
  check('tới chỗ lặn: cano dừng đúng chỗ đậu gốc của sảnh (< 0,05 m)', !!fd && Math.hypot(fd.x - MO[0], fd.z - MO[1]) < 0.05 && fd.speed < 0.01,
    fd ? fd.x.toFixed(2) + ',' + fd.z.toFixed(2) : 'không có khung dive');
  const ds = every(F.filter(f => f.state !== 'dive'), 0.25).map(f => f.dR), mo = monotone(ds, 1, 1.5);
  check('chuyến ra: khoảng cách cano → quán tăng dần (lùi ngược tối đa 1,5 m)', mo.ok && ds[ds.length - 1] > 100, ds[0].toFixed(0) + ' → ' + ds[ds.length - 1].toFixed(0) + ' m, lùi ngược ' + mo.worst.toFixed(2) + ' m, ' + ds.length + ' mẫu');
  const dr = F.filter(f => f.dave === 'Diveready');
  check('Dave chạy anim nhảy gốc (Diveready) sau khi dừng', dr.length > 0 && dr[0].state === 'dive', dr.length + ' khung Diveready');
  check('Diveready tại chỗ, không bay khỏi đuôi (x Dave giữ nguyên), màn tối dần tới > 0,5',
    dr.length > 0 && dr.every(f => Math.abs(f.daveX - dr[0].daveX) < 1e-6) && Math.max(...dr.map(f => f.fade)) > 0.5,
    dr.length ? dr[0].daveX.toFixed(2) + ' → ' + dr[dr.length - 1].daveX.toFixed(2) + ', tối ' + Math.max(...dr.map(f => f.fade)).toFixed(2) : '');

  // ---- chuyến về (cũng không đụng gì cả) ----
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
  await until(() => { const i = HX.phases.boat.info(); return i.active && i.loaded; });
  check('tiêu đề chuyến về có "về quán"', (await page.textContent('#scr-boat h2')).includes('về quán'), await page.textContent('#scr-boat h2'));
  I = await B();
  check('chuyến về chạy buổi tối', I.time === 'evening', I.time);
  check('chuyến về là dãy đoạn respawn → depart (Exit002) → cruise → arrive (Enter01 thuyền khách)',
    I.segs.join(' ') === 'respawn:hold depart:clip:Boat_Exit002 cruise:link arrive:guest:Lobby_GuestBoat01_Enter01', I.segs.join(' '));
  const homeShots = followShots(page, [
    { name: '5-home-respawn', state: 'respawn', t: 1.2 }, { name: '6-home-depart', state: 'depart', t: 3 },
    { name: '7-home-cruise', state: 'cruise', t: 8 }, { name: '8-home-docked', state: 'docked' },
  ], shot);
  const h0 = Date.now();
  await phase('kitchen');
  await homeShots;
  check('chuyến về kết thúc bằng G.go("kitchen")', JSON.stringify(await went()) === '["kitchen"]', ((Date.now() - h0) / 1000).toFixed(1) + ' s');
  T = await lastTrip(); F = T.frames;
  check('trace chuyến về: đủ khung từ đầu tới lúc sang kitchen', T.dir === 'home' && F.length > 100 && T.end === 'kitchen', F.length + ' khung, kết ' + T.end);
  f0 = F[0];
  check('chuyến về mở bằng anim gốc Respawn (Dave leo lên thuyền) ở chỗ lặn', f0.state === 'respawn' && f0.dave === 'Respawn' && f0.dR > 100, f0.state + ' / ' + f0.dave + ', cách quán ' + f0.dR.toFixed(0) + ' m');
  fm = F.find(f => f.seg === 'depart' && f.segT >= 1.82);
  exp = await expect({ kind: 'clip', clip: 'Boat_Exit002', t: fm.segT });
  err = Math.hypot(fm.x - exp[0], fm.z - exp[1]);
  check('giữa đoạn depart, vị trí khớp khoá gốc Boat_Exit002 tính từ chỗ đậu (sai số < 0,1 m)', err < 0.1, 'lệch ' + err.toFixed(4) + ' m ở ' + fm.segT.toFixed(2) + ' s');
  const hc = F.filter(f => f.state === 'cruise');
  check('chuyến về tự chạy qua đoạn cruise mà không cần phím', hc.length > 10 && hc.every(f => f.speed > 0.2), hc.length + ' khung');
  fm = F.find(f => f.seg === 'arrive' && f.segT >= 2);
  exp = await expect({ kind: 'guest', clip: 'Lobby_GuestBoat01_Enter01', from: 5, t: fm.segT });
  err = Math.hypot(fm.x - exp[0], fm.z - exp[1]);
  check('đoạn arrive chạy đúng đường gốc Lobby_GuestBoat01_Enter01 (sai số < 0,1 m)', err < 0.1, 'lệch ' + err.toFixed(4) + ' m');
  const fk = F.find(f => f.state === 'docked');
  check('cuối chuyến về: quán nằm trong khung hình', !!fk && inFrame(fk.ndc), fk ? fmt(fk.ndc) : 'không có khung docked');
  check('cuối chuyến về: cano đậu cạnh quán (< 15 m)', !!fk && fk.dR < 15, fk ? fk.dR.toFixed(1) + ' m' : '');
  const dh = every(F.filter(f => f.state !== 'docked'), 0.25).map(f => f.dR), peak = dh.indexOf(Math.max.apply(null, dh)), mh = monotone(dh.slice(peak), -1, 1.5);
  check('chuyến về: khoảng cách cano → quán giảm dần sau vòng quay đầu', mh.ok && dh[dh.length - 1] < 0.15 * dh[0],
    dh[0].toFixed(0) + ' → đỉnh ' + dh[peak].toFixed(0) + ' → ' + dh[dh.length - 1].toFixed(0) + ' m, tăng ngược ' + mh.worst.toFixed(2) + ' m');

  // ---- Bỏ qua ----
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'out' }));
  await page.click('#boat-skip');
  await phase('dive');
  check('"Bỏ qua" chiều ra vào thẳng loading', JSON.stringify(await went()) === '["loading"]');
  await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
  await page.click('#boat-skip');
  await phase('kitchen');
  check('"Bỏ qua" chiều về vào thẳng kitchen', JSON.stringify(await went()) === '["kitchen"]');
  check('rời pha thì dỡ HUD cano', (await page.$$('#scr-boat .bt-hud')).length === 0);

  // ---- 5 chuyến liền nhau không rò bộ nhớ GPU ----
  const mem = () => page.evaluate(() => { const m = HX.game.gfx.renderer.info.memory; return m.geometries + '/' + m.textures; });
  const during = [], after5 = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => HX_DEBUG.go('boat', { dir: 'home' }));
    // đo ở cùng một lúc mỗi chuyến: đang chạy biển khơi (mọi nhóm hạt đã vẽ ít nhất một lần)
    await until(() => { const i = HX.phases.boat.info(); return i.active && i.state === 'cruise'; });
    await sleep(500);
    during.push(await mem());
    await page.click('#boat-skip');
    await phase('kitchen');
    await sleep(200);
    after5.push(await mem());
  }
  check('5 chuyến: geometry/texture lúc đang chạy không tăng', during.every(m => m === during[0]), during.join(' '));
  check('5 chuyến: rời pha thì trả hết về như cũ', after5.every(m => m === after5[0]), after5.join(' '));

  check('không lỗi trang, không lỗi console, không 404', errors.length === 0, errors.slice(0, 6).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const args = process.env.SWIFTSHADER ? ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  const browser = await chromium.launch({ args });
  // trang đầu của trình duyệt có lúc mất WebGL context (xem tools/README-boat.md): mở một trang nháp trước
  const warm = await browser.newPage(); await warm.goto('about:blank');
  try {
    await run(browser, base, 1280, 720, false);
    await run(browser, base, 844, 390, true);
  } catch (e) {
    fail++;
    console.log('  ✘ lỗi khi chạy: ' + (e && e.stack || e));
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
