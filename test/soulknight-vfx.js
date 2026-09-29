/*
 * Kiểm thử hiệu ứng thật (SK 8.6) của Hiệp Sĩ Linh Hồn: data/sk-vfx.js + js/vfx.js + tools/vfx/viewer.html.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-vfx.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-vfx/.
 *
 * 1. Trang xem: nạp đủ atlas, lưới hiệu ứng vẽ ra điểm ảnh thật, không lỗi trang.
 * 2. Mô phỏng tất định (bước 1/60 s): hạt xuất hiện rồi chết đúng tuổi thọ; mọi hiệu ứng không lặp tự tắt.
 * 3. Hiệu năng: 60 vụ nổ nặng nhất cùng lúc trên khung 400×225, đo fps.
 * 4. Trong game: nạp vfx.js vào index.html (móc SK.updateFx/SK.drawFx), sinh hiệu ứng cạnh người chơi, chụp.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.env.SK_BASE || 'http://localhost:8811/games/soulknight/';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-vfx');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
function watch(p, errs) {
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
}

async function viewer(b) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  watch(p, errs);
  await p.goto(BASE + 'tools/vfx/viewer.html?q=^(hit_|explode_s|Fire2$|buff_fire)&zoom=2');
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  const info = await p.evaluate(() => ({
    pages: SK.vfx.pages.length, loaded: SK.vfx.pages.filter(Boolean).length, effects: Object.keys(SK_VFX.effects).length,
    cells: document.querySelectorAll('.cell').length
  }));
  check('atlas hiệu ứng nạp đủ trang', info.pages > 0 && info.loaded === info.pages, info.loaded + '/' + info.pages + ' trang, ' + info.effects + ' hiệu ứng');
  await p.waitForTimeout(1200);
  // ô nào có điểm ảnh khác nền = hiệu ứng thật đã vẽ
  const lit = await p.evaluate(() => {
    let n = 0;
    for (const c of window.VFX_VIEWER.cells()) {
      const d = c.ctx.getImageData(0, 0, c.cv.width, c.cv.height).data;
      let diff = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 14) + Math.abs(d[i + 1] - 16) + Math.abs(d[i + 2] - 22) > 40) diff++;
      if (diff > 30) n++;
    }
    return { n, of: window.VFX_VIEWER.cells().length };
  });
  check('lưới xem: có ô vẽ ra hiệu ứng', lit.n >= 5, lit.n + '/' + lit.of + ' ô có điểm ảnh hiệu ứng lúc chụp');
  await p.screenshot({ path: path.join(SHOTS, 'viewer-grid.png') });
  await p.goto(BASE + 'tools/vfx/viewer.html?sel=explode_s&q=explode');
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SHOTS, 'viewer-detail-explode_s.png') });
  check('trang xem không lỗi', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ---- mô phỏng tất định
  const sim = await p.evaluate(() => {
    const X = SK.vfx, V = SK_VFX, out = {};
    // một hiệu ứng có hạt: đếm theo thời gian
    const G = {};
    const h = X.spawn(G, 'hit_yellow', 50, 50, { seed: 1 });
    const counts = [];
    let maxLife = 0;
    for (const n of h.def.nodes) if (n.ps) { const l = n.ps.life; maxLife = Math.max(maxLife, typeof l === 'number' ? l : (l.b != null ? l.b : l.m)); }
    for (let i = 0; i < 180; i++) { X.update(G, 1 / 60); counts.push(h.sys.reduce((s, x) => s + x.parts.length, 0)); }
    out.hitYellow = { peak: Math.max(...counts), at005: counts[3], atEnd: counts[counts.length - 1], alive: G.vfx.length, dur: h.def.dur, maxLife };
    // mọi hiệu ứng: sinh, chạy 1 lượt, không ném lỗi; hiệu ứng không lặp phải tự tắt
    const names = Object.keys(V.effects);
    let thrown = [], stuck = [], particlesSeen = 0, withPs = 0;
    const lifeMax = d => d.nodes.reduce((m, nd) => { if (!nd.ps) return m; const l = nd.ps.life; return Math.max(m, typeof l === 'number' ? l : l.c ? l.m : Math.max(l.a, l.b)); }, 0);
    for (const n of names) {
      const d = V.effects[n];
      const G2 = {};
      try {
        const h2 = X.spawn(G2, n, 0, 0, { seed: 3, dur: d.loop ? 1 : undefined });
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const ctx = cv.getContext('2d');
        // hệ có phát (rate/bursts) và nút đang bật lúc sinh; hệ chỉ phát bằng script (Emit) không tính
        const hasPs = h2.sys.some(s => (s.d.rate != null || s.d.bursts) && h2.nodes[s.i].vis); if (hasPs) withPs++;
        let seen = 0;
        const lim = Math.min(45, (d.loop ? 1 : d.dur) + lifeMax(d) + 1);
        let t = 0;
        while (G2.vfx.length && t < lim) { X.update(G2, 1 / 30); t += 1 / 30; if (hasPs) seen = Math.max(seen, h2.sys.reduce((s, x) => s + x.parts.length, 0)); if ((t * 30 | 0) % 10 === 0) X.draw(ctx, G2); }
        if (seen) particlesSeen++;
        if (G2.vfx.length) stuck.push(n);
      } catch (e) { thrown.push(n + ': ' + e.message); }
    }
    out.all = { n: names.length, thrown: thrown.slice(0, 5), nThrown: thrown.length, stuck: stuck.slice(0, 8), nStuck: stuck.length, particlesSeen, withPs };
    // hạt của các ô lưới xem đang chạy song song không tính
    out.live = X.stats.particles - window.VFX_VIEWER.cells().reduce((s, c) => s + (c.G.vfx || []).reduce((t, h) => t + h.sys.reduce((u, x) => u + x.parts.length, 0), 0), 0);
    return out;
  });
  const hy = sim.hitYellow;
  check('hit_yellow: hạt xuất hiện ngay (≤0.05 s)', hy.at005 > 0, 'hạt ở 0.05 s: ' + hy.at005 + ', đỉnh ' + hy.peak);
  check('hit_yellow: hạt chết theo tuổi thọ, hiệu ứng tự huỷ theo RGAutoDestory', hy.atEnd === 0 && hy.alive === 0, 'sau 3 s còn ' + hy.atEnd + ' hạt, ' + hy.alive + ' instance (dur ' + hy.dur + ' s, tuổi thọ hạt ' + hy.maxLife + ' s)');
  check('mọi hiệu ứng chạy không ném lỗi', sim.all.nThrown === 0, sim.all.nThrown + ' lỗi ' + sim.all.thrown.join(' | '));
  check('mọi hiệu ứng tự tắt (lặp thì theo dur)', sim.all.nStuck === 0, sim.all.nStuck + ' kẹt ' + sim.all.stuck.join(', '));
  check('hệ hạt có rate/bursts đều phát ra hạt', sim.all.particlesSeen >= sim.all.withPs * 0.97, sim.all.particlesSeen + '/' + sim.all.withPs + ' hiệu ứng đã phát');
  check('bộ đếm hạt về 0 khi mọi thứ tắt', sim.live === 0, 'còn ' + sim.live);

  // ---- hiệu năng: 60 vụ nổ nặng nhất
  const perf = await p.evaluate(async () => {
    const X = SK.vfx, V = SK_VFX;
    const score = n => V.effects[n].nodes.reduce((s, nd) => s + (nd.ps ? Math.min(nd.ps.max || 50, 200) : 0), 0);
    const heavy = Object.keys(V.effects).filter(n => /explode|boom|blast/i.test(n) && !V.effects[n].loop).sort((a, b) => score(b) - score(a)).slice(0, 12);
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 225; document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const G = {};
    let frames = 0, maxP = 0, worst = 0, k = 0;
    const t0 = performance.now();
    await new Promise(res => {
      let last = t0;
      function f(now) {
        const dt = (now - last) / 1000; last = now; worst = Math.max(worst, dt);
        while (G.vfx === undefined || G.vfx.length < 60) { X.spawn(G, heavy[k++ % heavy.length], 20 + (k * 37) % 360, 20 + (k * 53) % 185, { seed: k }); }
        X.update(G, 1 / 60);
        ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 400, 225);
        X.draw(ctx, G);
        maxP = Math.max(maxP, X.stats.particles);
        frames++;
        if (now - t0 < 3000) requestAnimationFrame(f); else res();
      }
      requestAnimationFrame(f);
    });
    const secs = (performance.now() - t0) / 1000;
    X.clear(G); cv.remove();
    return { fps: frames / secs, maxP, worstMs: worst * 1000, heavy: heavy.slice(0, 4) };
  });
  check('60 vụ nổ nặng cùng lúc ≥ 30 fps', perf.fps >= 30, Math.round(perf.fps) + ' fps, đỉnh ' + perf.maxP + ' hạt, khung tệ nhất ' + Math.round(perf.worstMs) + ' ms (' + perf.heavy.join(', ') + ')');
  await p.close();
}

async function inGame(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  watch(p, errs);
  await p.goto(BASE + 'index.html');
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  // index.html chưa có thẻ script (bên lead thêm) → nạp tay theo đúng thứ tự sẽ thêm
  const tagged = await p.evaluate(() => !!(window.SK && SK.vfx));
  if (!tagged) {
    await p.addScriptTag({ url: BASE + 'data/sk-vfx.js' });
    await p.addScriptTag({ url: BASE + 'js/vfx.js' });
  }
  const hooked = await p.evaluate(async () => { const ok = SK.vfx.hook(); await SK.vfx.load(); return ok && !!SK.updateFx._vfx && !!SK.drawFx._vfx; });
  check('vfx.js móc vào SK.updateFx/SK.drawFx', hooked, tagged ? 'đã có thẻ script' : 'nạp bằng addScriptTag');
  await p.evaluate(() => SK_GAME.debug.seed(20260929));
  await p.click('#sk-start');
  await p.waitForFunction(() => SK_GAME.state === 'stage', null, { timeout: 5000 });
  await p.evaluate(() => SK_GAME.debug.god(true));
  await p.waitForTimeout(1900);
  const n = await p.evaluate(() => {
    const G = SK.G, pl = G.player;
    const list = ['explode_s', 'hit_yellow', 'Fire2', 'buff_fire', 'effect_black_smoke', 'muzzle_bullet_4'];
    list.forEach((nm, i) => SK.vfx.spawn(G, nm, pl.x - 60 + i * 24, pl.y - 20 + (i % 2) * 24, { seed: i, dur: 3 }));
    SK.vfx.spawn(G, 'buff_fire', 0, -14, { follow: pl, dur: 3 });
    return G.vfx.length;
  });
  await p.waitForTimeout(150);
  const mid = await p.evaluate(() => ({ n: SK.G.vfx.length, parts: SK.vfx.stats.particles }));
  await p.screenshot({ path: path.join(SHOTS, 'ingame.png') });
  check('trong game: hiệu ứng sinh ra và được cập nhật mỗi bước', n >= 6 && mid.n >= 1 && mid.parts > 0, n + ' sinh, sau 0.15 s còn ' + mid.n + ', ' + mid.parts + ' hạt');
  // dur 3 s + tuổi thọ hạt dài nhất (Fire2: 5 s [ĐO])
  const t0 = Date.now();
  await p.waitForFunction(() => SK.G.vfx.length === 0, null, { timeout: 12000 }).catch(() => {});
  const end = await p.evaluate(() => ({ n: SK.G.vfx.length, parts: SK.vfx.stats.particles }));
  check('trong game: hiệu ứng tắt hết sau dur + tuổi thọ hạt', end.n === 0 && end.parts === 0, 'tắt sau ' + ((Date.now() - t0) / 1000 + 0.15).toFixed(1) + ' s; còn ' + end.n + ' instance, ' + end.parts + ' hạt');
  check('trong game không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.close();
}

(async () => {
  const b = await chromium.launch();
  try {
    await viewer(b);
    await inGame(b);
  } catch (e) {
    check('chạy hết kịch bản', false, e.message);
  }
  await b.close();
  console.log('soulknight-vfx: ' + pass + ' đạt, ' + fail + ' trượt');
  console.log(results.join('\n'));
  console.log('ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
