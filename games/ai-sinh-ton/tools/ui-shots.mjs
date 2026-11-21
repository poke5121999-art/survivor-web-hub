// Screenshots and checks for the 3D UI kit demo (ui-demo.html) at the Galaxy S22, Xiaomi 17T and a desktop window.
// Run: timeout 600 node tools/ui-shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'landscape', 'shots-ui');
fs.mkdirSync(OUT, { recursive: true });
const DEMO = { path: '/games/ai-sinh-ton/ui-demo.html' };
const SCREENS = ['home', 'grid', 'hud'];
// three known panels per demo screen for the frame-vanishing check (portraits animate their own pose, so only the steady ones)
const KNOWN = { home: ['start', 'tab-2', 'tab-0'], grid: ['sort', 'merge', 'tile-0'], hud: ['pt-0', 'pt-2', 'pt-3'] };
const { check, done } = checker();
// the demo renders continuously: freeze it for two frames so a screenshot never catches a half-drawn one
const hold = async (page, on) => { await page.evaluate((o) => { window.__hold = o; return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, on); };
const shot = async (page, opts) => { await hold(page, true); const b = await page.screenshot(opts); await hold(page, false); return b; };
const wait = (page, ms) => page.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms);

const srv = await serve();
const br = await launch();
const files = [];
try {
  for (const phone of ['s22', 'xiaomi', 'desktop']) {
    const { ctx, page, problems } = await open(br, srv.base, phone, 'screen=home', DEMO);
    const calls = {};
    for (const s of SCREENS) {
      await page.evaluate((n) => window.__show(n), s); await wait(page, 900);
      calls[s] = await page.evaluate(() => window.__ui.drawCalls);
      const f = path.join(OUT, `${s}-${phone}.png`); await shot(page, { path: f }); files.push(f);
      if (phone === 's22' && s === 'grid') {
        await page.evaluate(() => window.__demo.scroll.scrollTo(420)); await wait(page, 500);
        const f2 = path.join(OUT, `grid-icons-${phone}.png`); await shot(page, { path: f2 }); files.push(f2);
        await page.evaluate(() => window.__demo.scroll.scrollTo(1100)); await wait(page, 500);
        const f3 = path.join(OUT, `grid-icons2-${phone}.png`); await shot(page, { path: f3 });
        await page.evaluate(() => window.__demo.scroll.scrollTo(1700)); await wait(page, 500);
        await shot(page, { path: path.join(OUT, `grid-icons3-${phone}.png`) });
        await page.evaluate(() => window.__demo.scroll.scrollTo(0)); await wait(page, 400);
      }
    }
    console.log(`draw calls ${phone}: ` + JSON.stringify(calls));
    check(problems.length === 0, `${phone}: no page problems` + (problems.length ? ' ' + problems.slice(0, 3).join(' | ') : ''));
    check(calls.home <= 112 && calls.hud <= 120 && calls.grid <= 210, `${phone}: draw calls home at most 112, hud at most 120, the grid sheet at most 210 (${JSON.stringify(calls)}; before the layer merge 131 / 135 / 227)`);

    if (phone === 's22') {
      for (const s of SCREENS) {
        await page.evaluate((n) => window.__show(n), s); await wait(page, 600);
        const ts = await page.evaluate(() => window.__ui.targets());
        const small = ts.filter((t) => t.w < 47.9 || t.h < 47.9);
        check(ts.length > 0 && !small.length, `${s}: ${ts.length} targets all at least 48 x 48` + (small.length ? ' small: ' + small.map((t) => t.id).join(',') : ''));
        const bad = [];
        for (const t of ts) {
          if (!t.enabled) continue;
          const got = await page.evaluate(([x, y]) => window.__ui.hitAt(x, y), [t.x + t.w / 2, t.y + t.h / 2]);
          if (got !== t.id) bad.push(`${t.id}->${got}`);
        }
        check(!bad.length, `${s}: hitAt(centre) returns the target's own id` + (bad.length ? ' bad: ' + bad.join(' ') : ''));
      }
      // a real touch tap fires onTap
      await page.evaluate(() => { window.__show('home'); window.__taps.length = 0; }); await wait(page, 500);
      const start = (await page.evaluate(() => window.__ui.targets())).find((t) => t.id === 'start');
      await page.touchscreen.tap(start.x + start.w / 2, start.y + start.h / 2); await wait(page, 300);
      check((await page.evaluate(() => window.__taps)).includes('start'), 'real touch tap on the start button fires onTap');
      // a press visibly moves the button
      const rect = { x: Math.round(start.x), y: Math.round(start.y), width: Math.round(start.w), height: Math.round(start.h) };
      const before = await shot(page, { clip: rect });
      const y0 = await page.evaluate(() => window.__ui.node('start').slot.parent.position.y);
      await page.mouse.move(start.x + start.w / 2, start.y + start.h / 2); await page.mouse.down(); await wait(page, 160);
      const during = await shot(page, { clip: rect });
      const y1 = await page.evaluate(() => window.__ui.node('start').slot.parent.position.y);
      fs.writeFileSync(path.join(OUT, 'press-down.png'), during);
      await page.mouse.up();
      check(y0 - y1 > 1.5 && Buffer.compare(before, during) !== 0, `pressed button sinks ${(y0 - y1).toFixed(1)} design px and its pixels change`);
      // dragging in a scroll scrolls and does not tap a tile
      await page.evaluate(() => { window.__show('grid'); window.__taps.length = 0; window.__demo.scroll.scrollTo(0); }); await wait(page, 500);
      await page.mouse.move(560, 280); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(560, 280 - i * 22); await page.mouse.up(); await wait(page, 500);
      const sc = await page.evaluate(() => window.__demo.scroll.getScroll());
      check(sc > 80 && !(await page.evaluate(() => window.__taps)).some((t) => t.startsWith('tile')), `dragging the grid scrolls it (${sc.toFixed(0)} px) and taps no tile`);
      await page.evaluate(() => window.__demo.scroll.scrollTo(0)); await wait(page, 300);
      // a tile tap still works
      const tile = (await page.evaluate(() => window.__ui.targets())).find((t) => t.id === 'tile-1');
      await page.touchscreen.tap(tile.x + tile.w / 2, tile.y + tile.h / 2); await wait(page, 200);
      check((await page.evaluate(() => window.__taps)).includes('tile-1'), 'real touch tap on a tile in the scroll fires onTap');
    }

    // text crispness and diacritics
    await page.evaluate(() => window.__show('home')); await wait(page, 400);
    const crisp = await page.evaluate(() => ({ texels: window.__title.texels, need: window.devicePixelRatio * (document.getElementById('frame').clientWidth / 780), w: window.__title.w }));
    check(crisp.texels >= crisp.need * 0.98, `${phone}: title has ${crisp.texels.toFixed(2)} texels per design px, needs ${crisp.need.toFixed(2)}`);
    const dia = await page.evaluate(() => {
      const out = [];
      for (const s of ['ẦỄỘỮ', 'ẢI SINH TỒN', 'KỶ BĂNG HÀ', 'RỒNG HƯ KHÔNG']) {
        const t = window.__ui.text(s, { size: 28, upper: true }), c = t.canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let first = -1, last = -1, left = c.width, right = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (first < 0) first = y; last = y; left = Math.min(left, x); right = Math.max(right, x); }
        out.push({ s, first, bottom: c.height - 1 - last, left, rightGap: c.width - 1 - right, h: c.height });
        t.dispose();
      }
      return out;
    });
    for (const d of dia) check(d.first >= 2 && d.bottom >= 2 && d.left >= 2 && d.rightGap >= 2, `${phone}: "${d.s}" keeps margin around its ink (top ${d.first}, bottom ${d.bottom}, left ${d.left}, right ${d.rightGap}, canvas h ${d.h})`);
    if (phone === 's22') {
      // a panel holding buttons, tiles, text and a portrait disposes without a throw and gives everything back
      const dis = await page.evaluate(async () => {
        const ui = window.__ui; const scr = ui.screen('__dispose'); const warm = ui.screen('__warm');
        const build = (host, tag) => {
          const p = ui.panel({ w: 320, h: 300, color: 0x4a3a86 }); host.put(p, 20, 100);
          p.put(ui.button({ id: tag + 'b1', w: 120, h: 48, label: 'ĐÁNH', icon: 'gold', onTap() {} }), 10, 10);
          p.put(ui.button({ id: tag + 'b2', w: 120, h: 48, label: 'MUA', onTap() {} }), 150, 10);
          p.put(ui.tile({ id: tag + 't1', size: 56, color: 'epic', icon: 'gem', level: 5 }), 10, 80);
          p.put(ui.tile({ id: tag + 't2', size: 56, color: 'rare', icon: 'gold', plus: 3 }), 80, 80);
          const inner = ui.panel({ w: 200, h: 100, color: 0x2a2150 }); p.put(inner, 10, 150);
          inner.put(ui.text('Nhóm Trận Nhiệt Huyết', { size: 14 }), 8, 8);
          inner.put(ui.portrait('thep', { size: 56, id: tag + 'pt' }), 130, 20);
          return p;
        };
        // build and dispose once first so the shared caches (glyph atlases, geometry, materials) are warm, then measure
        const w0 = build(warm, 'w'); warm.visible = true; await new Promise((r) => setTimeout(r, 300)); w0.dispose();
        await new Promise((r) => setTimeout(r, 200));
        const before = ui.memory(); const tBefore = ui.targets().length;
        const p = build(scr, 'x'); scr.visible = true; await new Promise((r) => setTimeout(r, 400));
        const built = ui.memory(); const tBuilt = ui.targets().filter((t) => t.id.startsWith('x')).length;
        let threw = ''; try { p.dispose(); } catch (e) { threw = String(e && e.message); }
        await new Promise((r) => setTimeout(r, 300));
        const after = ui.memory(); let inScene = false; for (let a = p; a; a = a.parent) if (a === scr) inScene = true;
        const left = ui.targets().filter((t) => t.id.startsWith('x')).length;
        scr.visible = false;
        return { threw, inScene, left, tBuilt, built, before, after, tBefore };
      });
      check(!dis.threw && !dis.inScene && dis.left === 0 && dis.tBuilt >= 5, `nested dispose: no throw (${dis.threw || 'none'}), node gone from the scene (${!dis.inScene}), its ${dis.tBuilt} targets gone (${dis.left} left)`);
      const dg = dis.after.geometries - dis.before.geometries, dt = dis.after.textures - dis.before.textures;
      check(dg <= 2 && dt <= 0, `nested dispose gives back GPU memory: geometries ${dis.before.geometries} -> ${dis.built.geometries} built -> ${dis.after.geometries}, textures ${dis.before.textures} -> ${dis.built.textures} -> ${dis.after.textures} (shared cache allowance: 2 geometries)`);

      // no one-frame vanishing, measured two ways, neither of which reads the multisampled canvas back on every frame:
      //   (1) draws: on 600 free-running frames the kit draws exactly the same meshes of three known panels every frame
      //       (a fault in layers, scissor passes, visibility or render order would skip one); this runs on the normal page;
      //   (2) pixels: on a page without canvas antialiasing (?aa=0), the panels' pixels read on every one of 600 frames never
      //       drop more than 2% under their median.
      // Measured 21/11/2026 with CDP screencast frames (no readback in the page, 3000 frames, a second Chrome running stage 15):
      // on the antialiased canvas panels lose their lit layers on 46 to 786 of 3000 composited frames while the kit issues the
      // same 142 draws on every frame; with antialias off 0 of 3000. preserveDrawingBuffer, the depth mask before clearDepth
      // and depth testing change nothing. The loss is in this box's GPU stack (multisampled canvas, two GPU processes), not
      // in the kit, so the pixel half runs without antialiasing and the draw half guards the kit's own render.
      const ab = await open(br, srv.base, 's22', 'screen=home&aa=0', DEMO);
      for (const s of SCREENS) {
        await page.evaluate((n) => window.__show(n), s); await wait(page, 900);
        const d = await page.evaluate((ids) => new Promise((resolve) => {
          const ui = window.__ui, r = ui.renderer, nodes = ids.map((id) => ui.node(id)).filter(Boolean);
          const own = new Map(); nodes.forEach((n, i) => n.traverse((o) => { if (o.isMesh) own.set(o, i); }));
          const orig = ui.render, rbd = r.renderBufferDirect; let cur = null; const rows = [];
          r.renderBufferDirect = function (cam, sc, g, m, o) { if (cur && own.has(o)) cur[own.get(o)]++; return rbd.apply(this, arguments); };
          ui.render = function () {
            cur = nodes.map(() => 0); orig.apply(this, arguments); rows.push(cur); cur = null;
            if (rows.length >= 600) { ui.render = orig; r.renderBufferDirect = rbd; resolve({ n: nodes.length, rows }); }
          };
        }), KNOWN[s]);
        const dr = KNOWN[s].map((id, i) => { const c = d.rows.map((x) => x[i]); const first = c[0]; return { id, first, off: c.filter((x) => x !== first).length }; });
        check(d.n === 3 && dr.every((x) => x.first > 0 && x.off === 0), `${s}: 600 frames, the kit draws the same meshes of ${KNOWN[s].join(', ')} on every frame (${dr.map((x) => `${x.id} ${x.first} draws, ${x.off} frames differ`).join('; ')})`);

        const q = ab.page;
        await q.evaluate((n) => window.__show(n), s); await wait(q, 900);
        await q.evaluate(([n, ids]) => {
          const ui = window.__ui; const cv = document.querySelector('canvas'); const gl = cv.getContext('webgl2') || cv.getContext('webgl'); const Hh = gl.drawingBufferHeight; const k = ui.u * ui.dpr;
          const ts = ids.map((id) => ui.targets().find((t) => t.id === id)).filter(Boolean);
          const rects = ts.map((t) => ({ id: t.id, x: Math.max(0, Math.round(t.x * k)), y: Math.round(Hh - (t.y + t.h) * k), w: Math.round(t.w * k), h: Math.round(t.h * k) }));
          window.__vz = { ui, gl, rects, n, orig: ui.render, grab: () => rects.map((r) => { const b = new Uint8Array(r.w * r.h * 4); gl.readPixels(r.x, r.y, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; }) };
          window.__ref = null; ui.hide(n, { transition: 'none' });
          ui.render = function () { window.__vz.orig.apply(this, arguments); if (!window.__ref) window.__ref = window.__vz.grab(); };
        }, [s, KNOWN[s]]);
        await wait(q, 400);
        const r = await q.evaluate((n) => new Promise((resolve) => {
          const { ui, grab, rects, orig } = window.__vz; ui.render = orig; ui.show(n, { transition: 'none' });
          setTimeout(() => {
            const ref = window.__ref; const rows = [];
            ui.render = function () {
              orig.apply(this, arguments); const g = grab();
              rows.push(g.map((b, i) => { let c = 0; const R = ref[i]; for (let p = 0; p < b.length; p += 4) if (Math.abs(b[p] - R[p]) + Math.abs(b[p + 1] - R[p + 1]) + Math.abs(b[p + 2] - R[p + 2]) > 30) c++; return c; }));
              if (rows.length >= 600) { ui.render = orig; resolve({ rects, rows }); }
            };
          }, 900);
        }), s);
        const worst = r.rects.map((x, i) => { const c = r.rows.map((y) => y[i]).sort((a, b) => a - b); const med = c[300]; const lowAt = r.rows.map((y, f) => (y[i] < med * 0.98 ? f : -1)).filter((f) => f >= 0); return { id: x.id, med, drop: med ? (med - c[0]) / med : 1, lowAt }; });
        check(worst.length === 3 && worst.every((x) => x.med > 500 && x.drop <= 0.02), `${s}: 600 frames read on every frame (canvas without antialiasing), no frame loses more than 2% of a panel's pixels (${worst.map((x) => `${x.id} median ${x.med} worst -${(x.drop * 100).toFixed(1)}%${x.lowAt.length ? ' at frames ' + x.lowAt.slice(0, 6).join(',') : ''}`).join(', ')})`);
      }
      check(ab.problems.length === 0, 'aa=0 demo page: no page problems' + (ab.problems.length ? ' ' + ab.problems.slice(0, 2).join(' | ') : ''));
      await ab.ctx.close();
    }
    await ctx.close();
  }
  // every meta screen of the real game opened and closed 5 times gives its GPU memory back
  { const { ctx, page, problems } = await open(br, srv.base, 's22');
    await page.waitForFunction(() => window.__G && window.__G.screens && window.__G.screens.home && window.__step, null, { timeout: 60000 });
    const res = await page.evaluate(() => {
      const G = window.__G, ui = window.__ui, out = [];
      const cycle = (name) => { G.goto(name); window.__step(20); G.goto('home'); window.__step(20); };
      // the home diorama draws some meshes for the first time only after a few hundred frames: let the count settle before measuring
      let last = -1, still = 0; for (let f = 0; f < 3000 && still < 400; f += 50) { window.__step(50); const g = ui.memory().geometries; still = g === last ? still + 50 : 0; last = g; }
      for (const name of Object.keys(G.screens).filter((n) => !['home', 'hud', 'result', 'stats', 'pick', 'battle'].includes(n))) {
        let err = '';
        try { G.goto(name); window.__step(20); const dc = ui.drawCalls; G.goto('home'); window.__step(20); const m0 = ui.memory(), g = [], t = []; for (let k = 0; k < 20; k++) { cycle(name); const m = ui.memory(); g.push(m.geometries); t.push(m.textures); } out.push({ name, m0, g, t, dc }); } catch (e) { err = String(e && e.message); out.push({ name, err }); }
      }
      return out;
    });
    console.log('draw calls game s22 (UI only, screen just opened): ' + JSON.stringify(Object.fromEntries(res.filter((r) => !r.err).map((r) => [r.name, r.dc]))));
    for (const r of res) {
      if (r.err) { check(false, `open/close ${r.name} x5: threw ${r.err}`); continue; }
      // a leak grows with every cycle (the old kill() workaround left about 9 geometries per cycle). The heroes screen's count
      // wobbles without a trend (measured 21/11 over 40 cycles: 661..666, idle 664), so a fixed allowance is either flaky or blind:
      // the mean of the counts after cycles 11-20 minus the mean after cycles 1-10 must stay under 1.5 (0.15 per cycle)
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, trend = (a) => mean(a.slice(10)) - mean(a.slice(0, 10));
      const dg = trend(r.g), dt = trend(r.t), rng = (a) => `${Math.min(...a)}..${Math.max(...a)}`;
      check(dg < 1.5 && dt < 1.5, `open/close ${r.name} x20 after one warm cycle: geometries ${r.m0.geometries} then ${rng(r.g)}, trend ${dg.toFixed(1)}; textures ${r.m0.textures} then ${rng(r.t)}, trend ${dt.toFixed(1)} (second ten minus first ten, under 1.5)`);
    }
    check(res.length >= 3 && problems.length === 0, `open/close cycles covered ${res.map((r) => r.name).join(', ')}, no page problems` + (problems.length ? ' ' + problems.slice(0, 2).join(' | ') : ''));
    await ctx.close(); }
  // placeholder portraits without Blockade Z
  { const { ctx, page, problems } = await open(br, srv.base, 's22', 'screen=hud&nobz=1', DEMO); await wait(page, 800);
    const f = path.join(OUT, 'hud-nobz-s22.png'); await shot(page, { path: f });
    check(problems.length === 0, 'nobz=1: placeholder portraits, no page problems' + (problems.length ? ' ' + problems.slice(0, 2).join(' | ') : '')); await ctx.close(); }
  const order = [];
  for (const s of SCREENS) for (const p of ['s22', 'xiaomi', 'desktop']) order.push(path.join(OUT, `${s}-${p}.png`));
  sheet(order, path.join(OUT, 'sheet.png'), 3, 300);
} finally { await br.close(); srv.close(); }
done();
