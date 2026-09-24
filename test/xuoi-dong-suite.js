/*
 * XUÔI DÒNG — bộ kiểm.
 *
 * Chạy:  node test/xuoi-dong-suite.js            (thêm --thumb để ghi lại ảnh bìa hub)
 * Ảnh chụp ra thư mục SHOTS (mặc định %TEMP%/xuoi-dong-shots) — mở ra xem bằng mắt.
 *
 * Phục vụ repo qua HTTP (audio cần fetch; file:// thì game phải im tiếng chứ không vỡ, có bài riêng).
 * Kỳ vọng viết CỨNG: thêm/bớt một loài cá, một tệp tiếng thì bài phải đỏ.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'xuoi-dong-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

// Tên khung pixel mà render.js/ui.js ghép chuỗi mà ra (không nằm trong bảng dữ liệu).
const LITERAL_FRAMES = [].concat(
  ['FishA_0', 'GodrayA', 'GodrayB', 'VFX_Firefly', 'Raindrops_0', 'Raindrops_6', 'VFX_Puff_0', 'VFX_Puff_1', 'FarmingCamp_LogoPixel_0', 'WaterLines'],
  [1, 2, 3, 4].map(i => 'WaterSplash_' + i), [1, 2, 3, 4, 5].map(i => 'SplashAnim_' + i),
  [1, 2, 3, 4].map(i => 'Raindrops_' + i), [0, 1, 2, 3].map(i => 'VFX_Bubbles_' + i),
  [0, 1, 2, 3, 4, 5, 6, 7].map(i => 'VFX_Sparkles_' + i), [0, 1, 2].map(i => 'DayPhase_icons_' + i),
  ['Cloud_vfx_sheet_0', 'Cloud_vfx_sheet_2', 'Cloud_vfx_sheet_5', 'Cloud_vfx_sheet_8'],
  [].concat.apply([], [0, 1, 2, 3, 4, 5, 6, 7].map(b => [0, 1, 2, 3].map(f => 'BirdFly' + b + '_' + f))),
  [].concat.apply([], [0, 1, 2, 3, 4].map(r => [0, 1].map(f => 'Butterfly' + r + '_' + f))),
  [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => 'Frog_' + i)
);

async function open(browser, port, query, vp, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp || { width: 1280, height: 720 }, deviceScaleFactor: 1 }, opts || {}));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(`http://localhost:${port}/games/xuoi-dong/index.html?${query}`);
  await page.waitForFunction(() => window.XD && XD.game && XD.render.IMG.atlas && XD.render.IMG.atlas.complete, null, { timeout: 10000 });
  await page.evaluate(() => {
    window.__missing = [];
    const F = XD_ATLAS.frames;
    XD_ATLAS.frames = new Proxy(F, { get(t, k) { if (typeof k === 'string' && !(k in t)) window.__missing.push(k); return t[k]; } });
  });
  return { ctx, page, errs };
}

async function suiteData(browser, port) {
  out.push('\n[1] Bảng dữ liệu, khung atlas, tệp tiếng');
  const { ctx, page, errs } = await open(browser, port, 'seed=1');
  try {
    const d = await page.evaluate((lit) => {
      const A = XD_ATLAS, need = new Set(lit);
      const anim = k => Array.isArray(k) ? k : (A.anims[k] || ['<anim thiếu: ' + k + '>']);
      Object.values(XD.KINDS).forEach(K => { (K.anims || []).forEach(a => anim(a).forEach(n => need.add(n))); (K.frames || []).forEach(n => need.add(n)); });
      Object.values(XD.FISH).forEach(F => anim(F.jump).forEach(n => need.add(n)));
      XD.BIRDS.forEach(B => B.idle.concat(B.sing).forEach(n => need.add(n)));
      Object.values(XD.BOATS).forEach(B => anim(B.anim).forEach(n => need.add(n)));
      anim('BoatWhistle').forEach(n => need.add(n));
      const missing = [...need].filter(n => !A.frames[n]);
      const banks = Object.values(XD.BIOMES).map(b => b.bank).filter(Boolean).filter(k => !A.banks[k]);
      return { need: need.size, missing, banks, fish: Object.keys(XD.FISH).length, route: XD.ROUTE.length, audio: Object.keys(XD_AUDIO).length, biomes: Object.keys(XD.BIOMES).length };
    }, LITERAL_FRAMES);
    check('mọi khung pixel mà code gọi tới đều có trong atlas', d.missing.length === 0, d.need + ' khung, thiếu: ' + d.missing.join(', '));
    check('mọi khúc sông có ảnh bờ', d.banks.length === 0, d.banks.join(','));
    check('có đúng 9 loài cá', d.fish === 9, 'đếm được ' + d.fish);
    check('có đúng 6 khúc (4 sông + cửa sông + biển)', d.biomes === 6, 'đếm được ' + d.biomes);
    check('có đúng 45 tệp tiếng', d.audio === 45, 'đếm được ' + d.audio);
    const au = await page.evaluate(async () => {
      const ac = new OfflineAudioContext(2, 44100, 44100), res = {};
      for (const k of Object.keys(XD_AUDIO)) {
        try {
          const r = await fetch('audio/' + k + '.mp3');
          const b = await ac.decodeAudioData(await r.arrayBuffer());
          res[k] = b.duration;
        } catch (e) { res[k] = -1; }
      }
      return res;
    });
    const bad = Object.keys(au).filter(k => !(au[k] > 0));
    check('mọi tệp tiếng giải mã được, dài > 0', bad.length === 0, bad.length ? 'hỏng: ' + bad.join(',') : Object.keys(au).length + ' tệp');
    const loops = ['mus_day', 'mus_night', 'amb_water', 'amb_rain'].map(k => k + '=' + au[k].toFixed(1) + 's');
    check('nhạc/nền đủ dài để lặp chồng đuôi 3.5s', ['mus_day', 'mus_golden', 'mus_dawn', 'mus_night'].every(k => au[k] > 30) && Object.keys(au).filter(k => k.startsWith('amb_')).every(k => au[k] > 20), loops.join(' '));
    const font = await page.evaluate(() => document.fonts.check('700 44px Cambria', 'Xuôi Dòng'));
    check('font tiêu đề phủ đủ dấu tiếng Việt (Cambria)', font);
    check('không lỗi khi nạp', errs.length === 0, errs.join(' | '));
  } finally { await ctx.close(); }
}

const SCENES = [
  ['trua-song', 't=0.48&biome=canyon&weather=clear'],
  ['hoang-hon-rung', 't=0.69&biome=forest&weather=clear'],
  ['dem-song', 't=0.9&biome=canyon&weather=clear'],
  ['binh-minh-bien', 't=0.26&biome=sea&weather=clear'],
  ['mua', 't=0.5&biome=forest&weather=rain'],
];
const VIEWS = [[1280, 720], [844, 390], [390, 844]];

async function suiteShots(browser, port) {
  out.push('\n[2] Ảnh chụp các cảnh (xem bằng mắt: ' + SHOTS + ')');
  for (const [w, h] of VIEWS) {
    for (const [name, q] of SCENES) {
      const { ctx, page, errs } = await open(browser, port, q + '&seed=3&freeze=1&play=1', { width: w, height: h });
      try {
        await page.waitForTimeout(1800);
        const file = path.join(SHOTS, `${name}-${w}x${h}.png`);
        await page.screenshot({ path: file });
        const miss = await page.evaluate(() => [...new Set(window.__missing)]);
        check(`${name} ${w}x${h}: không lỗi, không khung thiếu`, errs.length === 0 && miss.length === 0, errs.concat(miss).join(' | '));
        if (name === 'dem-song' && w === 1280) {
          // Đèn cabin phải sáng ấm hơn hẳn mặt nước tối xung quanh.
          const px = await page.evaluate(() => {
            const G = XD.game, v = G.view, c = document.getElementById('scene').getContext('2d');
            const s = (x, y) => { const d = c.getImageData(x * v.S, y * v.S, 1, 1).data; return [d[0], d[1], d[2]]; };
            const bx = v.bx + XD.BOAT_PTS.window[0], by = v.cy + G.boatY + XD.BOAT_PTS.window[1];
            return { lamp: s(bx, by + 6), water: s(v.w - 40, v.cy + 60) };
          });
          check('ban đêm: ô cửa cabin sáng ấm (đỏ > lam) và sáng hơn mặt nước', px.lamp[0] > px.lamp[2] && px.lamp[0] > px.water[0] + 60, 'cửa ' + px.lamp + ' / nước ' + px.water);
        }
      } finally { await ctx.close(); }
    }
  }
}

async function suitePlay(browser, port) {
  out.push('\n[3] Chơi thật: lái, bắt cá, đâm đá, còi');
  const { ctx, page, errs } = await open(browser, port, 't=0.4&biome=canyon&weather=clear&seed=7&freeze=1');
  try {
    await page.click('#start');
    await page.waitForFunction(() => XD.game.mode === 'play');
    await page.waitForTimeout(300);
    await page.evaluate(() => { XD.game.ents = XD.game.ents.filter(e => e.kind === 'bird' || e.kind === 'frog' ? false : !XD.KINDS[e.kind].obstacle && e.kind !== 'fish'); XD.game.boatY = 0; });
    const y0 = await page.evaluate(() => XD.game.boatY);
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(900); await page.keyboard.up('ArrowDown');
    const y1 = await page.evaluate(() => XD.game.boatY);
    check('giữ ↓ 0.9s: thuyền xuống dưới ít nhất 40px', y1 - y0 > 40, `${y0.toFixed(1)} → ${y1.toFixed(1)}`);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
    const y2 = await page.evaluate(() => XD.game.boatY);
    check('giữ W 0.9s: thuyền lên lại ít nhất 40px', y1 - y2 > 40, `${y1.toFixed(1)} → ${y2.toFixed(1)}`);

    const s0 = await page.evaluate(() => XD.game.speed);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1200);
    const s1 = await page.evaluate(() => XD.game.speed);
    await page.keyboard.up('ArrowRight');
    check('giữ → : thuyền nhanh hơn tốc độ thả trôi', s1 > s0 + 30, `${s0.toFixed(0)} → ${s1.toFixed(0)} px/s`);
    await page.waitForTimeout(800);

    const c0 = await page.evaluate(() => { const G = XD.game; G.ents = []; XD.debug.spawn('fish', 150, XD.BOAT_PTS.net[1], { sp: 'H', vx: 0, jumpIn: 99, jt: -1, wob: 0 }); return { caught: G.caught, pts: G.points, j: (G.journal.H || { n: 0 }).n }; });
    await page.waitForTimeout(2600);
    const c1 = await page.evaluate(() => ({ caught: XD.game.caught, pts: XD.game.points, j: (XD.game.journal.H || { n: 0 }).n }));
    check('lái lưới qua một con cá: số cá +1', c1.caught === c0.caught + 1, `${c0.caught} → ${c1.caught}`);
    check('cá hồi cộng đúng 10 điểm', c1.pts === c0.pts + 10, `${c0.pts} → ${c1.pts}`);
    check('sổ cá ghi thêm một con cá hồi', c1.j === c0.j + 1, `${c0.j} → ${c1.j}`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('xd.journal') || '{}').H);
    check('sổ cá lưu vào localStorage', saved && saved.n === c1.j && /^\d\d:\d\d$/.test(saved.first), JSON.stringify(saved));

    await page.evaluate(() => { const G = XD.game; G.ents = []; G.caught = 3; G.shakeMax = 0; XD.debug.spawn('rock', 190, 0, { v: 0 }); });
    const shook = await page.evaluate(() => new Promise(res => {
      let max = 0; const t0 = performance.now();
      (function poll() { max = Math.max(max, XD.game.shake); if (performance.now() - t0 < 3500) requestAnimationFrame(poll); else res(max); })();
    }));
    const hit = await page.evaluate(() => ({ bumps: XD.game.stats.bumps, caught: XD.game.caught, mode: XD.game.mode }));
    check('đâm đá: có rung thân thuyền', shook > 0.2, 'rung tối đa ' + shook.toFixed(2));
    check('đâm đá: 1–2 cá trượt khỏi lưới, game vẫn chạy', hit.bumps === 1 && hit.caught >= 1 && hit.caught <= 2 && hit.mode === 'play', JSON.stringify(hit));

    const bird = await page.evaluate(() => { const G = XD.game; G.ents = []; const r = XD.debug.spawn('rock', 250, -90, { v: 0 }); return XD.debug.spawn('bird', 250, -98, { owner: r, sp: 0, dx: 0, dy: -8 }) && true; });
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    const hs = await page.evaluate(() => ({ horn: XD.game.hornT, birds: XD.game.ents.filter(e => e.kind === 'bird').map(e => e.state) }));
    check('Space: còi hú (khói ống khói đang chạy)', bird && hs.horn >= 0, 'hornT=' + hs.horn);
    check('Space: chim đậu gần đó bay đi', hs.birds.length === 1 && hs.birds[0] === 'fly', JSON.stringify(hs.birds));

    await page.keyboard.press('KeyP');
    const paused = await page.evaluate(() => [XD.game.mode, getComputedStyle(document.getElementById('pause')).display]);
    check('P: tạm dừng và hiện bảng', paused[0] === 'pause' && paused[1] === 'block', paused.join(','));
    await page.keyboard.press('KeyJ');
    const jr = await page.evaluate(() => ({ open: !document.getElementById('journal').hidden, count: document.getElementById('j-count').textContent }));
    check('J: sổ cá mở, đếm loài đã gặp', jr.open && /^\d\/9 loài$/.test(jr.count), JSON.stringify(jr));
    await page.screenshot({ path: path.join(SHOTS, 'so-ca-1280x720.png') });
    await page.keyboard.press('KeyJ'); await page.keyboard.press('KeyP');

    const au = await page.evaluate(() => ({ ok: XD.audio.ok, loaded: XD.audio.loaded, failed: XD.audio.failed, music: XD.audio.musicKey }));
    check('âm thanh: AudioContext mở sau cú bấm đầu, không tệp nào hỏng', au.ok && au.failed === 0 && au.loaded > 0, JSON.stringify(au));
    check('nhạc đúng giờ: 09:35 phát "Sail On" (mus_day)', au.music === 'mus_day', au.music);
    check('không lỗi suốt lượt chơi', errs.length === 0, errs.join(' | '));
  } finally { await ctx.close(); }
}

async function suiteTouch(browser, port) {
  out.push('\n[4] Cảm ứng màn dọc 390x844: kéo ngón tay để lái');
  const { ctx, page, errs } = await open(browser, port, 't=0.4&biome=canyon&seed=4&freeze=1', { width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  try {
    await page.tap('#start');
    await page.waitForFunction(() => XD.game.mode === 'play');
    await page.evaluate(() => { XD.game.ents = []; XD.game.boatY = -40; });
    const band = await page.evaluate(() => ({ h: XD.game.view.cssH, S: XD.game.view.S, w: XD.game.view.w }));
    const cdp = await ctx.newCDPSession(page);
    const pt = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });
    await pt('touchStart', band.h * 0.85);
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(100); await pt('touchMove', band.h * 0.85 + (i % 2)); }
    const y = await page.evaluate(() => XD.game.boatY);
    await pt('touchEnd');
    check('kéo ngón tay xuống dưới: thuyền đi xuống theo', y > 10, 'boatY ' + y.toFixed(1) + ', khung ảo rộng ' + band.w + 'px, S=' + band.S);
    await page.screenshot({ path: path.join(SHOTS, 'cam-ung-390x844.png') });
    check('không lỗi khi chơi bằng cảm ứng', errs.length === 0, errs.join(' | '));
  } finally { await ctx.close(); }
}

async function suiteFile(browser) {
  out.push('\n[5] Mở bằng file:// (không có máy chủ): chạy được, chỉ im tiếng');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///' + path.join(ROOT, 'games', 'xuoi-dong', 'index.html').replace(/\\/g, '/') + '?seed=2&biome=forest');
  await page.waitForFunction(() => window.XD && XD.game && XD.game.time > 1, null, { timeout: 10000 });
  await page.click('#start');
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => ({ mode: XD.game.mode, t: XD.game.time, loaded: XD.audio.loaded }));
  check('file:// — không pageerror, đã vào chơi', errs.length === 0 && st.mode === 'play' && st.t > 1, JSON.stringify(st) + ' ' + errs.join(' | '));
  await ctx.close();
}

async function thumb(browser, port) {
  const { ctx, page } = await open(browser, port, 't=0.44&biome=canyon&weather=clear&seed=11&freeze=1&shot=1', { width: 640, height: 360 });
  await page.waitForTimeout(2500);
  const file = path.join(ROOT, 'assets', 'thumbnails', 'xuoi-dong.png');
  await page.screenshot({ path: file });
  out.push('\n  ảnh bìa: ' + file);
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch();
  try {
    await suiteData(browser, port);
    await suitePlay(browser, port);
    await suiteTouch(browser, port);
    await suiteFile(browser);
    await suiteShots(browser, port);
    if (process.argv.includes('--thumb')) await thumb(browser, port);
  } catch (e) {
    fail++; out.push('  ✘ ném lỗi: ' + (e.stack || e));
  } finally {
    await browser.close(); srv.close();
  }
  console.log(out.join('\n'));
  console.log(`\n${pass} đạt, ${fail} hỏng`);
  process.exit(fail ? 1 : 0);
})();
