// Compare the ported originals against Lanternfall itself. For each view, the same gallery query string is rendered
// by the pinned Lanternfall build (r158, /ref/index.html) and by the port (r170, original.html) with the same
// deterministic clock, and the analysis screenshot of that view (D:/lanternfall-ref-analysis/shots, when one exists)
// is put beside them. Writes shots/compare/<view>.png (analysis | r158 live | r170 port | diff x6),
// shots/compare-originals.png (r158 | r170 for every view) and shots/compare/metrics.json.
// Usage: node tools/compare-originals.js [base=http://127.0.0.1:8765]   (needs tools/serve.js running)
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, openPage, sheet, diff, save } = require('./pw-lib.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const ANA = process.env.LF_SHOTS || 'D:/lanternfall-ref-analysis/shots';
const OUT = path.resolve(__dirname, '..', 'shots', 'compare');
const H = ['warden', 'reaver', 'fletcher', 'lamplighter', 'apothecary', 'rimebinder'];
const M = ['peatwight', 'thornling', 'rustbound', 'barrowking', 'cairnback', 'mossjaw', 'gloamhound', 'hollowstag', 'gloamwisp'];
const VIEWS = [
  ['heroes-lineup-idle', 'gallery', 120],
  ['heroes-lineup-walk', 'gallery&anim=walk', 100],
  ['heroes-lineup-attack-hit', 'gallery&anim=attack&t=-1', 30],
  ['monsters-lineup-idle', 'gallery&set=monsters', 120],
  ...H.map((n) => ['hero-' + n + '-front', 'gallery&fig=' + n, 120]),
  ...H.map((n) => ['hero-' + n + '-back', 'gallery&fig=' + n + '&face=3.64', 120]),
  ...H.map((n) => ['hero-' + n + '-face', 'gallery&fig=' + n + '&dist=1.5&ty=1.66&ch=1.68', 120]),
  ...M.map((n) => ['mon-' + n, 'gallery&fig=' + n, 120]),
  ['anim-warden-attack-t0.42', 'gallery&fig=warden&anim=attack&t=0.42', 30],
  ['anim-fletcher-shoot-t0.5', 'gallery&fig=fletcher&anim=attack&t=0.5', 30],
  ['anim-reaver-sunder-t0.56', 'gallery&fig=reaver&anim=skill2&t=0.56', 30],
  ['anim-warden-walk-2', 'gallery&fig=warden&anim=walk', 110],
  ['anim-warden-stagger', 'gallery&fig=warden&anim=stag&t=0.5', 40],
  ['anim-warden-down', 'gallery&fig=warden&anim=down', 150],
];
async function grab(b, url, frames) {
  const { page, ctx, errors } = await openPage(b, url);
  await page.waitForTimeout(400);
  // HumanAnim starts at a random phase (25-anim.js:39) and the two pages draw different amounts of Math.random
  // before it, so pin each animator's clock and phase to the same values in both pages
  await page.evaluate(() => { if (window.LF && LF.dbg) LF.dbg.figs.forEach((f, i) => { f.an.t = 3 + i * 1.7; f.an.ph = i * 0.9; }); });
  await page.evaluate((n) => window.__step(n), frames);
  await page.waitForTimeout(250);
  const buf = await page.screenshot();
  const verts = await page.evaluate(() => (window.LF && LF.dbg ? LF.dbg.verts : null));
  await ctx.close();
  return { buf, errors, verts };
}
(async () => {
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const b = await launch(); const metrics = {}; const pairs = [];
  try {
    for (const [name, qs, frames] of VIEWS) {
      if (only && !only.test(name)) continue;
      const ref = await grab(b, `${BASE}/ref/index.html?${qs}`, frames);
      const port = await grab(b, `${BASE}/original.html?${qs}&credit=0`, frames);
      const d = await diff(b, ref.buf, port.buf);
      const anaFile = path.join(ANA, name + '.png'), ana = fs.existsSync(anaFile) ? fs.readFileSync(anaFile) : null;
      save(path.join(OUT, name + '-r158.png'), ref.buf); save(path.join(OUT, name + '-r170.png'), port.buf);
      save(path.join(OUT, name + '.png'), await sheet(b, [
        { buf: ana, label: ana ? 'analysis shot (Lanternfall, earlier capture)' : 'no analysis shot for this view' },
        { buf: ref.buf, label: 'Lanternfall r158 live: ?' + qs },
        { buf: port.buf, label: 'port r170: original.html?' + qs },
        { buf: d.img, label: `|r158 - r170| x6   mean ${d.mad.toFixed(2)}/255, ${d.bigPct.toFixed(2)}% px > 24` },
      ], { cols: 2, title: name }));
      const sameVerts = JSON.stringify(ref.verts) === JSON.stringify(port.verts);
      metrics[name] = { mad: +d.mad.toFixed(3), bigPct: +d.bigPct.toFixed(3), sameVerts, verts: port.verts, refErrors: ref.errors.filter((e) => !/favicon|404/.test(e)), portErrors: port.errors.filter((e) => !/favicon|404/.test(e)) };
      console.log(name.padEnd(28), 'mad', d.mad.toFixed(2), 'big%', d.bigPct.toFixed(2), sameVerts ? 'verts same' : 'VERTS DIFFER', port.errors.length ? 'PORT ERRORS ' + port.errors.join(' | ') : '');
      pairs.push({ url: `${BASE}/shots/compare/${name}-r158.png`, label: name + '  r158' }, { url: `${BASE}/shots/compare/${name}-r170.png`, label: name + '  r170 port  (mean diff ' + d.mad.toFixed(2) + ')' });
    }
    save(path.join(OUT, 'metrics.json'), Buffer.from(JSON.stringify(metrics, null, 1)));
    if (!only) save(path.resolve(OUT, '..', 'compare-originals.png'), await sheet(b, pairs, { base: BASE + '/README.md', cols: 4, cw: 480, ch: 270, title: 'Lanternfall r158 (live, pinned ada0fd5) vs port on three r170 - same query, same deterministic clock' }));
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
