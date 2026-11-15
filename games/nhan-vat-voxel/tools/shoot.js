// Evidence run for index.html: every tab, the full survivor grid (fps), close-ups in idle / walk / attack,
// smooth | voxel side-by-side for 10 characters, phone width (overflow), and every console error.
// Usage: node tools/shoot.js [outDir=shots]   (env PW = playwright-core path)
'use strict';
const path = require('path'), fs = require('fs');
const PW = process.env.PW || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'shots'));
const PORT = 8793, BASE = `http://127.0.0.1:${PORT}/index.html`;
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 540000);
const TABS = ['survivors', 'zombies', 'bz-heroes', 'bz-zombies', 'bz-bosses'];
const CLOSE = ['r1c11', 'r5c12', 'r2c7', 'r6c4', 'z1', 'gio', 'nhen', 'walker', 'vampire'];
const ANIMS = ['idle', 'walk', 'attack'];
const CMP = ['r1c1', 'r1c11', 'r1c17', 'r2c7', 'r2c16', 'r3c4', 'r4c15', 'r5c12', 'r6c4', 'z2'];
const FACES = ['r1c11', 'r2c16', 'r5c12'];

async function compose(br, files, cols, cw, ch, labels, out) {
  const page = await br.newPage({ viewport: { width: 400, height: 300 } });
  const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const data = await page.evaluate(async ({ imgs, cols, cw, ch, labels }) => {
    const rows = Math.ceil(imgs.length / cols), c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
    const g = c.getContext('2d'); g.fillStyle = '#101116'; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < imgs.length; i++) {
      const im = new Image(); im.src = imgs[i]; await im.decode();
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch, k = Math.min(cw / im.width, ch / im.height);
      g.drawImage(im, x + (cw - im.width * k) / 2, y + (ch - im.height * k) / 2, im.width * k, im.height * k);
      if (labels && labels[i]) { g.font = '600 15px system-ui'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x + 6, y + 6, g.measureText(labels[i]).width + 12, 22); g.fillStyle = '#fff'; g.fillText(labels[i], x + 12, y + 22); }
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { imgs, cols, cw, ch, labels });
  fs.writeFileSync(out, Buffer.from(data, 'base64')); await page.close();
}

(async () => {
  fs.mkdirSync(path.join(OUT, 'parts'), { recursive: true });
  const srv = require('child_process').spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT), '530'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  const br = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const errors = [], report = {};
  const open = async (q, w = 1400, h = 900) => {
    const page = await br.newPage({ viewport: { width: w, height: h } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(q + ' :: ' + m.text()); });
    page.on('pageerror', (e) => errors.push(q + ' :: pageerror ' + e.message));
    await page.goto(BASE + q, { timeout: 60000 });
    await page.waitForFunction('window.__vc && (window.__vc.ready() || window.__vc.cur())', null, { timeout: 180000 });
    return page;
  };
  try {
    // 1. tabs
    for (const t of TABS) {
      const page = await open(`?tab=${t}&n=32`); await page.waitForTimeout(2200);
      await page.screenshot({ path: path.join(OUT, `tab-${t}.png`) });
      report['tab-' + t] = await page.evaluate(() => window.__stats); await page.close();
    }
    // 2. the whole survivor grid on one screen: fps idle and walking
    {
      const page = await open('?tab=survivors&n=32&fit=1', 1600, 1000); await page.waitForTimeout(3500);
      report.fitIdle = await page.evaluate(() => window.__stats);
      await page.screenshot({ path: path.join(OUT, 'grid-all-120.png') });
      await page.evaluate(() => window.__vc.gridAnim('walk')); await page.waitForTimeout(3000);
      report.fitWalk = await page.evaluate(() => window.__stats);
      await page.screenshot({ path: path.join(OUT, 'grid-all-120-walk.png') });
      for (const n of [16, 48]) { await page.evaluate((n) => window.__vc.density(n), n); await page.waitForFunction('window.__vc.ready()', null, { timeout: 120000 }); await page.waitForTimeout(2500); report['fitWalk' + n] = await page.evaluate(() => window.__stats); await page.screenshot({ path: path.join(OUT, `grid-all-120-n${n}.png`) }); }
      await page.close();
    }
    // 3. close-ups
    {
      const page = await open(`?tab=zombies&n=32`, 700, 760); const files = [], labels = [];
      for (const id of CLOSE) for (const a of ANIMS) {
        await page.evaluate(({ id, a }) => { window.__vc.inspect(id); window.__vc.anim(a); const c = window.__vc.cur(), h = c.c ? c.c.height : 1.85; window.__vc.orbit(0.45, 0.14, Math.max(2.6, h * 1.75), h * 0.52); }, { id, a });
        await page.waitForTimeout(a === 'attack' ? 520 : 900);
        const f = path.join(OUT, 'parts', `close-${id}-${a}.png`); await page.locator('#icv').screenshot({ path: f }); files.push(f); labels.push(`${id} · ${a}`);
      }
      await compose(br, files.slice(0, 15), 3, 420, 440, labels.slice(0, 15), path.join(OUT, 'closeups-chibi.png'));
      await compose(br, files.slice(15), 3, 420, 440, labels.slice(15), path.join(OUT, 'closeups-mixed.png'));
      await page.close();
    }
    // 4. smooth | voxel, 10 characters, front, same pose
    {
      const page = await open(`?tab=zombies&n=32`, 900, 700); const files = [], labels = [];
      for (const id of CMP) {
        await page.evaluate((id) => { window.__vc.inspect(id); window.__vc.compare(true); window.__vc.anim('idle'); window.__vc.orbit(0, 0.1, 4.4, 0.95); }, id);
        await page.waitForTimeout(700);
        const f = path.join(OUT, 'parts', `cmp-${id}.png`); await page.locator('#icv').screenshot({ path: f }); files.push(f);
        labels.push(await page.evaluate(() => document.getElementById('iname').textContent + ' — voxel | mượt'));
        if (FACES.includes(id)) { // faces up close, voxel only
          await page.evaluate(() => { window.__vc.compare(false); window.__vc.orbit(0, 0.05, 1.9, 1.55); }); await page.waitForTimeout(400);
          await page.locator('#icv').screenshot({ path: path.join(OUT, 'parts', `face-${id}.png`) });
        }
      }
      await compose(br, files, 2, 900, 560, labels, path.join(OUT, 'compare-smooth-vs-voxel.png'));
      await compose(br, FACES.map((id) => path.join(OUT, 'parts', `face-${id}.png`)), 3, 600, 470, FACES, path.join(OUT, 'faces-voxel.png'));
      await page.close();
    }
    // 5. phone width
    {
      const page = await open('?tab=survivors&n=32', 390, 844); await page.waitForTimeout(1500);
      report.phoneOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      report.phone = await page.evaluate(() => window.__stats);
      await page.screenshot({ path: path.join(OUT, 'phone-grid.png') });
      await page.evaluate(() => window.__vc.inspect('r2c7')); await page.waitForTimeout(800);
      report.phoneInspectOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: path.join(OUT, 'phone-inspect.png') });
      await page.close();
    }
  } finally {
    report.errors = errors;
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    await br.close(); srv.kill(); clearTimeout(kill);
  }
})().catch((e) => { console.error(e); process.exit(1); });
