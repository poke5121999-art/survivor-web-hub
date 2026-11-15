// Sharpness of the 3D view and the garage portrait on phones, before and after Addendum 9, with a guard.
//   timeout 900 node tools/sharp.js      DTT_BASE=<hub url> shoots the deployed build
// "before" is the same build asked for the old formula through the test hook ?legacyres=1 (pixel ratio = min(dpr, tier cap) * tier scale * old governor, FXAA as the tier says, no sharpening, 128 px portraits).
// A slow device is modelled two ways: CDP CPU throttle (4x, 6x), and ?govms=40 (a test hook: the governor is fed frame times of at least 40 ms, whatever the machine really does).
// Sharpness number: mean absolute Laplacian of luminance of a screenshot taken at device pixels with the HUD hidden (same seed, same tick, same camera). Shimmer: mean absolute difference of two frames one sim tick apart, divided by the Laplacian number.
// Outputs: .chk/sharp/{before,after}-<profile>-<state>.png (1:1 crops at device pixels), sheet.png, and a table. Exit 1 when the guard fails.
// SHARP_QUICK=1 shoots only the first two profiles.
'use strict';
const { execFileSync } = require('child_process');
const { session, CHK, fs, path } = require('./lib.js');
const OUT = path.join(CHK, 'sharp');
const UA = 'Mozilla/5.0 (Linux; Android 15; 2509FPN0BC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
// The owner's phone first (DPR unknown: 2.75 or 3), then the other phone shapes.
const PROFILES = [['xiaomi275', 1002, 461, 2.75], ['xiaomi3', 919, 423, 3], ['iphone', 844, 390, 3], ['android', 915, 412, 2.625], ['small', 740, 360, 2]].slice(0, process.env.SHARP_QUICK ? 2 : 5);
const FLOOR = 1.0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

async function ctxFor(br, w, h, dpr, portrait) {
  const ctx = await br.newContext({ viewport: portrait ? { width: h, height: w } : { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, userAgent: UA });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
  return ctx;
}
async function openPage(br, base, query, ctx) {
  const page = await ctx.newPage(); const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(base + '/games/dau-truong-thep/index.html?' + query);
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
  await page.evaluate(() => { const b = document.getElementById('boot'); if (b) b.style.display = 'none'; });
  return { page, problems };
}
const cpu = async (page, rate) => { const c = await page.context().newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate }); return c; };

// Page-side reading of the sizes and post state.
const readState = () => {
  const G = window.__G, c = document.getElementById('view'), r = c.getBoundingClientRect(), s = window.__stats, vv = window.visualViewport, st = G.gfx.post.state;
  return { css: [r.width, r.height], buf: [c.width, c.height], dpr: devicePixelRatio, pr: G.renderer.getPixelRatio(), scale: s.scale, gov: s.governor, step: s.governorStep, ms: s.ms, calls: s.calls, quality: G.quality.name, sharpness: s.sharpness || '-', vv: [vv.width, vv.height, vv.scale], ao: !!st.ao, bloom: st.bloom === false ? 0 : (st.bloomLevels ?? G.quality.bloomLevels), fxaa: !!st.fxaa, sharpen: +G.gfx.post.uniforms.uSharp.value.toFixed(2) };
};

// Governed run: what a player gets with default settings. Samples the effective scale (buffer / css box) twice a second.
async function governed(br, base, p, extra, rate, secs) {
  const [, w, h, dpr] = p;
  const ctx = await ctxFor(br, w, h, dpr), g = await openPage(br, base, 'autostart&noaudio&seed=7&bots=hard' + extra, ctx);
  const cdp = rate > 1 ? await cpu(g.page, rate) : null;
  const t0 = Date.now(), samples = []; let first = null;
  while (Date.now() - t0 < secs * 1000) {
    const s = await g.page.evaluate(readState); const t = (Date.now() - t0) / 1000;
    const eff = s.buf[0] / s.css[0]; if (!first) first = { ...s, eff, t };
    samples.push({ t, eff, gov: s.gov }); await sleep(500);
  }
  const last = await g.page.evaluate(readState); last.eff = last.buf[0] / last.css[0];
  const drop = samples.find((x) => x.eff < first.eff - 0.01 || x.gov > 0);
  const below = samples.filter((x) => x.eff < first.eff - 0.01).length * 0.5;
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();
  return { first, last, dropAt: drop ? drop.t : null, minEff: Math.min(...samples.map((x) => x.eff)), below, secs, problems: g.problems };
}

// One frozen frame: crops, full shots for the metric, frame cost.
async function fight(br, base, p, tag, query) {
  const [name, w, h, dpr] = p;
  const ctx = await ctxFor(br, w, h, dpr), g = await openPage(br, base, 'manual&autostart&noaudio&seed=7&mech=trau&bots=easy' + query, ctx), P = g.page;
  const info = await P.evaluate(() => {
    const G = window.__G; G.renderer.setAnimationLoop(null); window.__step(240, false);
    const u = G.match.units[G.me]; window.__setShot({ x: u.x, z: u.z });
    window.__step(0, true);
    const pt = G.project(u.x, 1, u.z);
    const hud = [...document.querySelectorAll('#ui .hud')].map((e) => e.innerText).join('').length;
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '#ui, #touch, a.hub, #boot { visibility: hidden !important; }' }));
    return { px: pt.x, py: pt.y, hudChars: hud };
  });
  const st = await P.evaluate(readState);
  const raw = (k) => path.join(OUT, `raw-${name}-${tag}-${k}.png`);
  await P.evaluate(() => window.__step(0, true)); await P.screenshot({ path: raw('a') });
  await P.evaluate(() => window.__step(1, true)); await P.screenshot({ path: raw('b') });
  const cost = async (n) => P.evaluate((n) => { const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); window.__step(1, true); t.push(performance.now() - a); } return t.reduce((a, b) => a + b) / n; }, n);
  const ms1 = await cost(60); const c = await cpu(P, 4); const ms4 = await cost(30); await c.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const calls = await P.evaluate(() => window.__stats.calls);
  await ctx.close();
  return { st, info, ms1, ms4, calls, raw: raw('a'), raw2: raw('b'), dpr, problems: g.problems };
}

// The garage: the mech portrait image at device pixels.
async function garage(br, base, p, tag, query, file) {
  const [name, w, h, dpr] = p;
  const ctx = await ctxFor(br, w, h, dpr), g = await openPage(br, base, 'noaudio&seed=7&fakenet=1' + query, ctx), P = g.page;
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) { ok = await P.evaluate(() => { const e = document.querySelector('#ui .md-head img'); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 20 && e.complete && e.naturalWidth > 0; }); if (!ok) await sleep(200); }
  if (!ok) { await ctx.close(); return null; }
  await sleep(500);
  const el = P.locator('#ui .md-head img').first();
  const info = await el.evaluate((e) => ({ css: [e.getBoundingClientRect().width, e.getBoundingClientRect().height], nat: [e.naturalWidth, e.naturalHeight] }));
  await el.screenshot({ path: file });
  await ctx.close();
  return { ...info, dpr, file, problems: g.problems };
}

// Moments a real phone goes through: load in portrait, first tap (fullscreen), rotation to landscape, browser bar showing and hiding.
async function moments(br, base, p) {
  const [name, w, h, dpr] = p;
  const ctx = await ctxFor(br, w, h, dpr, true), g = await openPage(br, base, 'noaudio', ctx), P = g.page;
  const cdp = await ctx.newCDPSession(P);
  const setVP = (W, H) => cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dpr, mobile: true, screenWidth: W, screenHeight: H });
  const out = [];
  const log = async (label) => { await sleep(900); const s = await P.evaluate(readState); out.push({ label, ...s, ratio: [s.buf[0] / (s.css[0] * s.pr), s.buf[1] / (s.css[1] * s.pr)], vvOk: Math.abs(s.css[0] - s.vv[0]) <= 1 && Math.abs(s.css[1] - s.vv[1]) <= 1 }); };
  await log('load (portrait)');
  await P.touchscreen.tap(60, 60); await log('first tap');
  await setVP(w, h); await log('rotated');
  await setVP(w, h - 56); await log('bar shown');
  await setVP(w, h); await log('bar hidden');
  await ctx.close();
  return out;
}

function pyMetrics(jobs) {
  const code = `import sys, json
from PIL import Image, ImageFilter, ImageChops, ImageStat
K = ImageFilter.Kernel((3, 3), (0, 1, 0, 1, -4, 1, 0, 1, 0), scale=1, offset=128)
def lap(im):
    h = im.convert('L').filter(K).histogram(); n = sum(h)
    return sum(abs(i - 128) * c for i, c in enumerate(h)) / n
out = []
for j in json.loads(sys.argv[1]):
    r = {}
    im = Image.open(j['file']).convert('RGB'); r['size'] = im.size; r['lap'] = lap(im)
    if j.get('crop'):
        x, y = j['crop']; x0 = max(0, min(im.width - 400, int(x) - 200)); y0 = max(0, min(im.height - 400, int(y) - 200))
        c = im.crop((x0, y0, x0 + 400, y0 + 400)); c.save(j['crop_out']); r['cropLap'] = lap(c)
    if j.get('file2'):
        d = ImageChops.difference(im, Image.open(j['file2']).convert('RGB')).convert('L'); r['diff'] = ImageStat.Stat(d).mean[0]
    out.append(r)
print(json.dumps(out))`;
  return JSON.parse(execFileSync('python3', ['-I', '-c', code, JSON.stringify(jobs)], { maxBuffer: 1 << 26 }).toString());
}

function sheet(rows, out) {
  const code = `import sys, json
from PIL import Image, ImageDraw, ImageFont
rows = json.loads(sys.argv[1]); out = sys.argv[2]
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except Exception: font = ImageFont.load_default()
C = 400; PAD = 8; LAB = 150; TXT = 40
ncol = max(len(r['cells']) for r in rows)
sh = Image.new('RGB', (LAB + ncol * (C + PAD) + PAD, len(rows) * (C + TXT + PAD) + PAD), (14, 18, 22)); d = ImageDraw.Draw(sh)
for i, r in enumerate(rows):
    y = PAD + i * (C + TXT + PAD)
    d.text((8, y + 8), r['name'], fill=(242, 182, 50), font=font)
    for k, c in enumerate(r['cells']):
        x = LAB + k * (C + PAD)
        try:
            im = Image.open(c['file']).convert('RGB'); im.thumbnail((C, C)); sh.paste(im, (x, y))
        except Exception: d.rectangle([x, y, x + C, y + C], outline=(160, 40, 40))
        d.text((x, y + C + 2), c['l1'], fill=(233, 238, 242), font=font); d.text((x, y + C + 21), c['l2'], fill=(159, 176, 189), font=font)
sh.save(out, optimize=True)`;
  execFileSync('python3', ['-I', '-c', code, JSON.stringify(rows), out], { maxBuffer: 1 << 26 });
}

const f2 = (x) => (x === null || x === undefined ? '-' : Number(x).toFixed(2));
session(async (br, base) => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const LEG = '&legacyres=1';
  const res = {}, jobs = [], rows = [];
  for (const [pi, p] of PROFILES.entries()) {
    const name = p[0], full = pi < 1, R = (res[name] = { p, gov: {}, fight: {}, garage: {}, q: {} });
    console.log(`\n== ${name} ${p[1]}x${p[2]} @${p[3]}`);
    // What a player gets: default settings, governed.
    const conds = full ? [['native', 1, 6], ['cpu4', 4, 12], ['cpu6', 6, 12], ['slow40', 1, 22]] : [['native', 1, 6], ['slow40', 1, 22]];
    for (const [label, rate, secs] of conds) {
      R.gov['before:' + label] = label === 'slow40' || label === 'cpu6' ? null : await governed(br, base, p, LEG, rate, secs);
      R.gov['after:' + label] = await governed(br, base, p, label === 'slow40' ? '&govms=40' : '', rate, secs);
    }
    // Frozen fight frames and cost.
    R.fight.before = await fight(br, base, p, 'before', LEG);
    R.fight.after = await fight(br, base, p, 'after', '');
    if (full) {
      R.fight.sharp = await fight(br, base, p, 'sharp', '&sharp=sharp');
      R.fight.max = await fight(br, base, p, 'max', '&sharp=max');
      for (const q of ['low', 'medium', 'high']) {
        R.q['before:' + q] = await fight(br, base, p, 'before-' + q, LEG + '&q=' + q);
        R.q['after:' + q] = await fight(br, base, p, 'after-' + q, '&q=' + q);
      }
    }
    for (const k of Object.keys(R.fight)) {
      const F = R.fight[k], file = path.join(OUT, `${k === 'before' ? 'before' : 'after'}-${name}-fight${k === 'before' || k === 'after' ? '' : '-' + k}.png`);
      F.crop = file; jobs.push({ file: F.raw, file2: F.raw2, crop: [F.info.px * p[3], F.info.py * p[3]], crop_out: file, who: [name, 'fight', k] });
    }
    R.garage.before = await garage(br, base, p, 'before', LEG, path.join(OUT, `before-${name}-garage.png`));
    R.garage.after = await garage(br, base, p, 'after', '', path.join(OUT, `after-${name}-garage.png`));
    for (const k of ['before', 'after']) if (R.garage[k]) jobs.push({ file: R.garage[k].file, who: [name, 'garage', k] });
    R.moments = await moments(br, base, p);
  }

  const M = pyMetrics(jobs.map(({ who, ...j }) => j)), met = {};
  jobs.forEach((j, i) => { met[j.who.join('|')] = M[i]; });
  const m = (n, s, k) => met[[n, s, k].join('|')];

  console.log('\nGOVERNED, default settings (what a player gets). eff = buffer width / CSS width; dev = eff / DPR');
  console.log('profile    build   run      start eff  final eff  final dev  min eff  drop at  below start  governor step  post (ao/bloom/fxaa/sharpen)');
  for (const n of Object.keys(res)) for (const [key, G] of Object.entries(res[n].gov)) {
    if (!G) continue; const [b, l] = key.split(':'), dpr = res[n].p[3];
    console.log(`${n.padEnd(10)} ${b.padEnd(7)} ${l.padEnd(8)} ${f2(G.first.eff).padStart(9)} ${f2(G.last.eff).padStart(10)} ${f2(G.last.eff / dpr).padStart(10)} ${f2(G.minEff).padStart(8)} ${(G.dropAt === null ? 'never' : G.dropAt.toFixed(1) + ' s').padStart(8)} ${(G.below.toFixed(1) + ' s').padStart(12)}  ${(G.last.step || '-').padEnd(12)}  ${+G.last.ao}/${G.last.bloom}/${+G.last.fxaa}/${G.last.sharpen}  tier ${G.last.quality}`);
  }
  console.log('\nFROZEN FIGHT (default settings unless named), sharpness = mean |Laplacian| of the whole frame at device pixels');
  console.log('profile    build   tier   buffer        eff  dev   post(ao/bloom/fxaa/sharpen)  sharp(frame)  sharp(crop)  shimmer   ms(1x)  ms(4x cpu)  calls  HUD chars');
  const rowsOut = [];
  for (const n of Object.keys(res)) {
    for (const [k, F] of Object.entries(res[n].fight)) {
      const me = m(n, 'fight', k), st = F.st;
      console.log(`${n.padEnd(10)} ${(k === 'before' ? 'before' : 'after ' + (k === 'after' ? '' : k)).padEnd(13)} ${st.quality.padEnd(6)} ${(st.buf.join('x')).padEnd(11)} ${f2(st.buf[0] / st.css[0]).padStart(5)} ${f2(st.buf[0] / st.css[0] / st.dpr).padStart(4)}  ${(+st.ao + '/' + st.bloom + '/' + +st.fxaa + '/' + st.sharpen).padEnd(26)} ${f2(me.lap).padStart(12)} ${f2(me.cropLap).padStart(12)} ${f2(me.diff / me.lap).padStart(8)} ${f2(F.ms1).padStart(8)} ${f2(F.ms4).padStart(11)} ${String(F.calls).padStart(6)} ${String(F.info.hudChars).padStart(9)}`);
    }
    for (const [k, F] of Object.entries(res[n].q)) { const st = F.st; console.log(`${n.padEnd(10)} ${k.split(':')[0].padEnd(7)} ${k.split(':')[1].padEnd(6)} ${(st.buf.join('x')).padEnd(11)} ${f2(st.buf[0] / st.css[0]).padStart(5)} ${f2(st.buf[0] / st.css[0] / st.dpr).padStart(4)}  ${(+st.ao + '/' + st.bloom + '/' + +st.fxaa + '/' + st.sharpen).padEnd(26)} ${''.padStart(12)} ${''.padStart(12)} ${''.padStart(8)} ${f2(F.ms1).padStart(8)} ${f2(F.ms4).padStart(11)} ${String(F.calls).padStart(6)}`); }
  }
  console.log('\nGARAGE portrait (element at device pixels)');
  for (const n of Object.keys(res)) for (const k of ['before', 'after']) { const g = res[n].garage[k], me = m(n, 'garage', k); console.log(`${n.padEnd(10)} ${k.padEnd(7)} ${g ? `image ${g.nat.join('x')} shown at ${g.css.map((x) => x.toFixed(0)).join('x')} CSS px (${(g.nat[0] / (g.css[0] * g.dpr)).toFixed(2)} image px per device px)  sharp ${f2(me.lap)}` : 'portrait not reachable'}`); }
  console.log('\nMOMENTS (default tier): ratio = buffer / (CSS box * pixel ratio); vv = CSS box equals visual viewport');
  for (const n of Object.keys(res)) for (const s of res[n].moments) console.log(`${n.padEnd(10)} ${s.label.padEnd(15)} buffer ${s.buf.join('x').padEnd(10)} css ${s.css.map((x) => x.toFixed(1)).join('x').padEnd(11)} pr ${s.pr.toFixed(3)} dpr ${s.dpr} eff ${f2(s.buf[0] / s.css[0])} ratio ${s.ratio.map((x) => x.toFixed(3)).join(',')} vv ${s.vvOk ? 'ok' : 'MISMATCH ' + s.vv.join('x')}`);

  console.log('\nGUARD');
  for (const n of Object.keys(res)) {
    const R = res[n];
    for (const [key, G] of Object.entries(R.gov)) { if (!G || !key.startsWith('after:')) continue; check(G.last.eff >= FLOOR - 0.01 && G.minEff >= FLOOR - 0.01, `[${n}] render scale never under ${FLOOR} CSS px per axis, ${key.split(':')[1]}: min ${f2(G.minEff)}, settled ${f2(G.last.eff)} (governor ${G.last.gov} ${G.last.step})`); }
    const b = m(n, 'fight', 'before'), a = m(n, 'fight', 'after');
    check(a.lap > b.lap, `[${n}] fight sharpness after ${f2(a.lap)} > before ${f2(b.lap)} (x${f2(a.lap / b.lap)})`);
    check(a.diff / a.lap <= b.diff / b.lap * 1.25, `[${n}] shimmer after ${f2(a.diff / a.lap)} not above before ${f2(b.diff / b.lap)} x1.25`);
    const gb = m(n, 'garage', 'before'), ga = m(n, 'garage', 'after');
    if (gb && ga) check(ga.lap >= gb.lap * 0.8 && res[n].garage.after.nat[0] >= res[n].garage.after.css[0] * res[n].p[3] * 0.99, `[${n}] garage portrait: image ${res[n].garage.after.nat[0]} px for ${(res[n].garage.after.css[0] * res[n].p[3]).toFixed(0)} device px, sharpness after ${f2(ga.lap)} within 20% of before (resampling a larger image down changes the number) ${f2(gb.lap)} (it is shown at ${res[n].garage.after.css[0].toFixed(0)} CSS px, so the old 128 px was a 1.3x upscale here)`); else check(false, `[${n}] garage portrait reachable`);
    for (const s of R.moments) check(Math.abs(s.ratio[0] - 1) <= 0.02 && Math.abs(s.ratio[1] - 1) <= 0.02 && s.vvOk && s.buf[0] / s.css[0] >= FLOOR - 0.01, `[${n}] ${s.label}: buffer ${s.buf.join('x')} for CSS box ${s.css.map((x) => x.toFixed(0)).join('x')} (ratio ${s.ratio.map((x) => x.toFixed(3)).join(',')}), box equals visual viewport`);
    for (const F of [...Object.values(R.fight), ...Object.values(R.q)]) if (F.problems.length) check(false, `[${n}] page errors: ${F.problems[0]}`);
  }

  // Sheet: before | after | Nét | Rất nét for the fight, before | after for the garage.
  for (const n of Object.keys(res)) {
    const R = res[n], cell = (state, k, label) => { const me = m(n, state, k); if (state === 'fight' && !R.fight[k]) return null; const st = state === 'fight' ? R.fight[k].st : null; const file = state === 'fight' ? R.fight[k].crop : R.garage[k] && R.garage[k].file; if (!me || !file) return null;
      const buf = st ? `${st.buf.join('x')} scale ${f2(st.buf[0] / st.css[0])}` : `image ${R.garage[k].nat.join('x')}`; return { file, l1: `${state} ${label}  ${buf}`, l2: `sharpness ${f2(state === 'fight' ? me.lap : me.lap)}${st ? '  crop ' + f2(me.cropLap) : ''}` }; };
    const cells = [cell('fight', 'before', 'before'), cell('fight', 'after', 'after (Tự động)'), cell('fight', 'sharp', 'Nét'), cell('fight', 'max', 'Rất nét'), cell('garage', 'before', 'before'), cell('garage', 'after', 'after')].filter(Boolean);
    rows.push({ name: `${n}\n${R.p[1]}x${R.p[2]}\nDPR ${R.p[3]}`, cells });
  }
  sheet(rows, path.join(OUT, 'sheet.png'));
  console.log('\nsheet: ' + path.join(OUT, 'sheet.png'));
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
});
