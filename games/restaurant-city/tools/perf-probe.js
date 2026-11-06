'use strict';
// Đo tốc độ Restaurant City trên một trang thật (Pages hoặc server tĩnh ở máy), in một dòng JSON.
//   load   : ms từ lúc mở trang tới mốc [RC-PERF] "GameWorld.start end" (vào được màn phố), lần đầu (cache trống)
//   reload : như trên nhưng tải lại trong cùng trình duyệt (asset đã có trong cache)
//   bytes  : tổng byte tải lần đầu, kèm 5 file nặng nhất
//   play   : 30 s sau khi vào quán: số khung hình trình duyệt vẽ được (fps), tổng ms bị chặn bởi long task, task dài nhất
// RC_URL=<trang game> RC_SESSION=<JSON HubSession, xem bot-session.js> [RC_ANGLE=d3d11] node perf-probe.js
const { chromium } = require(process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const URL_ = process.env.RC_URL;
const SESSION = process.env.RC_SESSION;
const ANGLE = process.env.RC_ANGLE || 'd3d11';
const PLAY_MS = Number(process.env.RC_PLAY_MS || 30000);
if (!URL_ || !SESSION) { console.error('perf-probe: RC_URL and RC_SESSION are not set'); process.exit(2); }

function observe() {
  window.__rcLong = [];
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__rcLong.push([e.startTime, e.duration]); })
      .observe({ type: 'longtask', buffered: true });
  } catch (e) { /* longtask unsupported */ }
  window.__rcFrames = [];
  const tick = (t) => { window.__rcFrames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

async function loadOnce(page, marks, reload) {
  marks.length = 0;
  const t0 = Date.now();
  if (reload) await page.reload(); else await page.goto(URL_);
  const deadline = t0 + 240000;
  while (!marks.some((m) => /GameWorld\.start end/.test(m.text))) {
    if (Date.now() > deadline) throw new Error('GameWorld.start end not seen within 240 s');
    await page.waitForTimeout(200);
  }
  const at = (re) => { const m = marks.find((x) => re.test(x.text)); return m ? m.t - t0 : null; };
  if (process.env.RC_PROBE_VERBOSE) {
    console.error((reload ? 'reload' : 'load') + ' marks:');
    for (const m of marks) console.error('  ' + (m.t - t0) + ' ' + m.text.replace(/^\[RC-PERF\] \+\d+ms /, ''));
  }
  return {
    total: at(/GameWorld\.start end/),
    config: at(/resource config complete/),
    swfs: at(/SWF initialized, 0 remaining/),
    rpcs: at(/startup RPCs success/),
  };
}

async function click(page, x, y) {
  const b = await page.locator('#stage').boundingBox();
  const k = (b.width - 10) / 760;
  await page.mouse.click(b.x + 5 + x * k, b.y + 5 + y * k);
}

(async () => {
  const args = ANGLE === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=' + ANGLE, '--enable-gpu', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ headless: true, args });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  await ctx.addInitScript((s) => { try { localStorage.setItem('hub.session.v1', s); } catch (e) { /* storage blocked */ } }, SESSION);
  await ctx.addInitScript(observe);
  const page = await ctx.newPage();
  const marks = [];
  page.on('console', (m) => { const text = m.text(); if (text.startsWith('[RC-PERF]')) marks.push({ t: Date.now(), text }); });
  const files = new Map();
  const rpcs = [];
  page.on('response', async (r) => {
    if (r.request().method() === 'POST' && /rc-rpc/.test(r.url())) {
      const t = r.request().timing();
      rpcs.push({ at: Math.round(t.startTime), ms: Math.round(t.responseEnd > 0 ? t.responseEnd : t.responseStart), timing: r.headers()['server-timing'] || '' });
      return;
    }
    if (r.request().method() !== 'GET') return;
    let size = Number(r.headers()['content-length'] || 0);
    if (!size) { try { size = (await r.body()).length; } catch (e) { size = 0; } }
    files.set(r.url().replace(/\?.*$/, ''), size);
  });

  const out = { url: URL_, angle: ANGLE };
  out.load = await loadOnce(page, marks, false);
  const sizes = [...files.entries()].sort((a, b) => b[1] - a[1]);
  out.bytes = { total: sizes.reduce((s, [, n]) => s + n, 0), top: sizes.slice(0, 5).map(([u, n]) => [u.replace(/^.*\//, ''), n]) };
  out.rpcs = rpcs.splice(0).slice(0, 6);
  out.reload = await loadOnce(page, marks, true);

  // Into the restaurant (two clicks on the house), then watch the frame rate while avatars cache.
  await page.waitForTimeout(3000);
  await click(page, 380, 300); await page.waitForTimeout(3000); await click(page, 380, 300);
  const from = await page.evaluate(() => performance.now());
  await page.waitForTimeout(PLAY_MS);
  out.play = await page.evaluate((t) => {
    const frames = window.__rcFrames.filter((x) => x >= t);
    const longs = window.__rcLong.filter(([s]) => s >= t);
    const gaps = frames.slice(1).map((x, i) => x - frames[i]).sort((a, b) => a - b);
    return {
      fps: Math.round(frames.length / ((performance.now() - t) / 1000) * 10) / 10,
      p95FrameMs: Math.round(gaps[Math.floor(gaps.length * 0.95)] || 0),
      longTasks: longs.length,
      blockedMs: Math.round(longs.reduce((s, [, d]) => s + d, 0)),
      maxTaskMs: Math.round(longs.reduce((m, [, d]) => Math.max(m, d), 0)),
    };
  }, from);
  if (process.env.RC_PROBE_VERBOSE) {
    out.longTasks = await page.evaluate((t) => window.__rcLong.filter(([s]) => s >= t).map(([s, d]) => [Math.round(s - t), Math.round(d)]), from);
  }
  console.log(JSON.stringify(out));
  await browser.close();
})().catch((e) => { console.error('perf-probe: ' + e.message); process.exit(1); });
