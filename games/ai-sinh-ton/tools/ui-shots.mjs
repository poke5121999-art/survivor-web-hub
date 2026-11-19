// Screenshots and checks for the 3D UI kit demo (ui-demo.html) at the Galaxy S22, Xiaomi 17T and a desktop window.
// Run: timeout 600 node tools/ui-shots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'ui');
fs.mkdirSync(OUT, { recursive: true });
const DEMO = { path: '/games/ai-sinh-ton/ui-demo.html' };
const SCREENS = ['home', 'grid', 'hud'];
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
    check(calls.home <= 150 && calls.hud <= 150 && calls.grid <= 240, `${phone}: draw calls home/hud at most 150, the 12-tile grid sheet at most 240 (${JSON.stringify(calls)})`);

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
      await page.mouse.move(180, 400); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(180, 400 - i * 25); await page.mouse.up(); await wait(page, 500);
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
    const crisp = await page.evaluate(() => ({ texels: window.__title.texels, need: window.devicePixelRatio * (document.getElementById('frame').clientWidth / 360), w: window.__title.w }));
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
    await ctx.close();
  }
  // placeholder portraits without Blockade Z
  { const { ctx, page, problems } = await open(br, srv.base, 's22', 'screen=hud&nobz=1', DEMO); await wait(page, 800);
    const f = path.join(OUT, 'hud-nobz-s22.png'); await shot(page, { path: f });
    check(problems.length === 0, 'nobz=1: placeholder portraits, no page problems' + (problems.length ? ' ' + problems.slice(0, 2).join(' | ') : '')); await ctx.close(); }
  const order = [];
  for (const s of SCREENS) for (const p of ['s22', 'xiaomi', 'desktop']) order.push(path.join(OUT, `${s}-${p}.png`));
  sheet(order, path.join(OUT, 'sheet.png'), 3, 300);
} finally { await br.close(); srv.close(); }
done();
