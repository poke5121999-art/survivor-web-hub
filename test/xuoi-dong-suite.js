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

// /__old/<tệp> phục vụ bản của commit OLD_REV (đọc thẳng từ git) để đo "trước" và "sau" cùng một cách.
const OLD_REV = '4249ade';
const { execFileSync } = require('child_process');
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const type = { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' };
      if (u.startsWith('/__old/')) {
        try { const b = execFileSync('git', ['show', OLD_REV + ':' + u.slice(7)], { cwd: ROOT, maxBuffer: 1 << 26 }); r.writeHead(200, type); r.end(b); }
        catch (e) { r.writeHead(404); r.end(); }
        return;
      }
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, type);
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


// Tua nhanh 20 lần ở màn đầu (thuyền tự lái, va chạm không trừ gì) qua MINUTES phút đường
// đi theo tốc độ thả trôi của chính bản đó, đếm mọi vật cản và thùng/hòm từng được sinh ra.
async function spawnRate(browser, port, prefix, minutes) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/${prefix}games/xuoi-dong/index.html?seed=5&t=0.4&weather=clear`);
  await page.waitForFunction(() => window.XD && XD.game && XD.game.time > 0.3, null, { timeout: 10000 });
  const r = await page.evaluate((minutes) => new Promise(res => {
    const G = XD.game, T = XD.TUNE, cruise = T.cruise, x0 = G.x, goal = cruise * 60 * minutes;
    T.cruise = cruise * 20;
    const obs = [], junk = { n: 0 }, most = { n: 0 };
    (function poll() {
      G.speed = T.cruise;
      G.ents.forEach(e => {
        if (e.__c) return;
        e.__c = 1;
        if (XD.KINDS[e.kind].obstacle) obs.push(e.x);
        if (e.kind === 'barrel' || e.kind === 'crate') junk.n++;
      });
      const on = G.ents.filter(e => XD.KINDS[e.kind].obstacle && e.x > G.x - 60 && e.x < G.x + G.view.w + 60).length;
      most.n = Math.max(most.n, on);
      if (G.x - x0 < goal) requestAnimationFrame(poll);
      else {
        obs.sort((a, b) => a - b);
        let gap = Infinity;
        for (let i = 1; i < obs.length; i++) gap = Math.min(gap, obs[i] - obs[i - 1]);
        res({ perMin: obs.length / minutes, junkPerMin: junk.n / minutes, minGap: Math.round(gap), maxOnScreen: most.n, cruise });
      }
    })();
  }), minutes);
  await ctx.close();
  return r;
}

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

async function suiteRate(browser, port) {
  out.push('\n[6] Mật độ vật cản: bản ' + OLD_REV + ' so với bản này (tua nhanh 5 phút đường đi, seed 5)');
  const before = await spawnRate(browser, port, '__old/', 5);
  const after = await spawnRate(browser, port, '', 5);
  out.push(`    trước: ${before.perMin.toFixed(1)} vật cản/phút, ${before.junkPerMin.toFixed(1)} thùng+hòm/phút, cùng lúc trên màn tối đa ${before.maxOnScreen}, khoảng cách nhỏ nhất ${before.minGap}px (thả trôi ${before.cruise}px/s)`);
  out.push(`    sau:   ${after.perMin.toFixed(1)} vật cản/phút, ${after.junkPerMin.toFixed(1)} thùng+hòm/phút, cùng lúc trên màn tối đa ${after.maxOnScreen}, khoảng cách nhỏ nhất ${after.minGap}px (thả trôi ${after.cruise}px/s)`);
  check('vật cản thưa: 4–5 cái mỗi phút (một cái mỗi 12–15 giây)', after.perMin >= 4 && after.perMin <= 5, after.perMin.toFixed(2) + '/phút');
  check('không bao giờ hai vật cản cùng lúc trên màn (1280x720)', after.maxOnScreen === 1, 'tối đa ' + after.maxOnScreen);
  check('hai vật cản liền nhau cách nhau ít nhất 1300px', after.minGap >= 1300, after.minGap + 'px');
  check('thùng + hòm còn khoảng một nửa so với trước', after.junkPerMin <= before.junkPerMin * 0.6 && after.junkPerMin >= before.junkPerMin * 0.3, before.junkPerMin.toFixed(1) + ' → ' + after.junkPerMin.toFixed(1) + '/phút');
}

// Lấy vị trí thật mà thuyền được vẽ ra (gốc lớp thuyền, pixel thiết bị) ở từng khung hình, kèm
// số khung 60 Hz đã trôi qua: máy chậm lỡ một khung thì bước đó chia đôi, để bài đo "có bị bậc
// thang không" không lẫn với bài đo "có kịp 60 khung không" (bài sau đo riêng bằng trung vị).
function sampleBoat(page, frames) {
  return page.evaluate((n) => new Promise(res => {
    const out = []; let last = performance.now();
    (function f(t) { out.push([Math.max(1, Math.round((t - last) / 16.67)), XD.render.boatPx.Y0]); last = t; if (out.length < n) requestAnimationFrame(f); else res(out); })(last);
  }), frames);
}
function steps(s) { const o = []; for (let i = 1; i < s.length; i++) o.push(Math.round(Math.abs(s[i][1] - s[i - 1][1]) / s[i][0])); return o; }

async function filmstrip(page, file) {
  const url = await page.evaluate(() => new Promise(res => {
    const c = document.getElementById('scene'), S = XD.game.view.S, B = XD.render.BB;
    const w = (B[2] - B[0]) * S, h = (B[3] - B[1] - 20) * S, cols = 4, rows = 3;
    const out = document.createElement('canvas'); out.width = w * cols; out.height = h * rows;
    const o = out.getContext('2d');
    let i = 0;
    (function f() {
      const b = XD.render.boatPx;
      o.drawImage(c, b.X0, b.Y0 + 20 * S, w, h, (i % cols) * w, ((i / cols) | 0) * h, w, h);
      if (++i < cols * rows) requestAnimationFrame(f); else res(out.toDataURL('image/png'));
    })();
  }));
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

async function suiteMotion(browser, port) {
  out.push('\n[7] Thuyền chuyển động mượt, vệt bọt, ngày đêm nhanh gấp ba, nhạc theo bộ ngày/đêm');
  for (const [w, h, dpr] of [[1280, 720, 1], [844, 390, 3]]) {
    const { ctx, page, errs } = await open(browser, port, 't=0.45&biome=canyon&weather=clear&seed=3&freeze=1&play=1', { width: w, height: h }, { deviceScaleFactor: dpr });
    try {
      await page.waitForTimeout(600);
      await page.evaluate(() => { const G = XD.game; G.ents = []; G.boostT = 0; G.obsX = G.pickX = G.x + 1e6; G.boatY = -40; });
      await page.waitForTimeout(400);
      const S = await page.evaluate(() => XD.game.view.S);
      const idle = steps(await sampleBoat(page, 120));
      check(`${w}x${h} dpr${dpr} (S=${S}): đứng yên, thuyền nhích tối đa 1 px thật mỗi khung`, Math.max(...idle) <= 1, 'bước lớn nhất ' + Math.max(...idle) + ' px');
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(250);
      const run = steps(await sampleBoat(page, 24));
      await page.keyboard.up('ArrowDown');
      const hist = {}; run.forEach(x => hist[x] = (hist[x] || 0) + 1);
      check(`${w}x${h} dpr${dpr}: đang lái, mỗi khung dịch đều (chênh lệch giữa các bước ≤ ${S} px, không khung nào đứng im)`,
        Math.max(...run) - Math.min(...run) <= S && Math.min(...run) >= 1, 'các bước ' + JSON.stringify(hist));
      await page.waitForTimeout(400);
      await filmstrip(page, path.join(SHOTS, `filmstrip-${w}x${h}-dpr${dpr}.png`));
      const perf = await page.evaluate(() => new Promise(res => {
        const ts = []; const t0 = performance.now();
        (function f(t) { ts.push(t); if (t - t0 < 3000) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); res(d[d.length >> 1]); } })(t0);
      }));
      check(`${w}x${h} dpr${dpr}: một khung vẽ xong trong 16,7 ms (trung vị)`, perf <= 17.2, perf.toFixed(1) + ' ms');
      const foam = await page.evaluate(() => {
        const G = XD.game, bx = G.view.bx;
        return { n: G.foam.length, behind: G.foam.filter(p => p.sx < bx - 90).length, far: G.foam.filter(p => p.y < G.boatY - 20).length };
      });
      check(`${w}x${h}: vệt bọt hai dải (trên ~100 hạt/s mỗi dải, sống 0,59 s), kéo ra sau đuôi thuyền`, foam.n >= 90 && foam.n <= 150 && foam.behind > 20 && foam.far > 30, JSON.stringify(foam));
      check(`${w}x${h}: không lỗi`, errs.length === 0, errs.join(' | '));
    } finally { await ctx.close(); }
  }

  const { ctx, page, errs } = await open(browser, port, 't=0.40&biome=canyon&seed=3');
  try {
    await page.click('#start');
    const t0 = await page.evaluate(() => XD.game.t);
    await page.waitForTimeout(2800);
    const t1 = await page.evaluate(() => XD.game.t);
    const secsPerDay = 2.8 / (t1 - t0);
    check('một ngày đêm dài 140 giây (nhanh gấp ba 420 giây)', Math.abs(secsPerDay - 140) < 12, secsPerDay.toFixed(0) + ' giây');
    const mus = await page.evaluate(async () => {
      const G = XD.game, r = {};
      const at = t => { G.t = t; return XD.debug.audioMix().music; };
      r.morning = at(0.30); r.golden = at(0.70); r.dusk = at(0.76); r.midnight = at(0.05);
      G.dayN++; r.nextDay = at(0.40); G.dayN--;
      return r;
    });
    check('nhạc chỉ đổi giữa bộ ngày và bộ đêm: sáng và nắng vàng cùng một bài', mus.morning === 'mus_day' && mus.golden === 'mus_day', JSON.stringify(mus));
    check('chạng vạng và nửa đêm là bài đêm', mus.dusk === 'mus_night' && mus.midnight === 'mus_night', JSON.stringify(mus));
    check('sang ngày mới thì bộ ngày chuyển bài kế tiếp (Sail On 2)', mus.nextDay === 'mus_golden', mus.nextDay);
    const tune = await page.evaluate(() => [XD.TUNE.cruise, XD.TUNE.slow, XD.TUNE.fast, XD.TUNE.boost]);
    check('tốc độ thả trôi 115 px/s (72 × 1,6), chậm 54, nhanh 205, tăng tốc 300', JSON.stringify(tune) === '[115,54,205,300]', JSON.stringify(tune));
    check('không lỗi', errs.length === 0, errs.join(' | '));
  } finally { await ctx.close(); }
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
    const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
    const run = k => !only || only.split(',').includes(k);
    if (run('data')) await suiteData(browser, port);
    if (run('play')) await suitePlay(browser, port);
    if (run('touch')) await suiteTouch(browser, port);
    if (run('file')) await suiteFile(browser);
    if (run('rate')) await suiteRate(browser, port);
    if (run('motion')) await suiteMotion(browser, port);
    if (run('shots')) await suiteShots(browser, port);
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
